import { NextResponse } from "next/server";
import { writeArticle } from "../../../lib/contentPipeline";
import { authorize } from "../../../lib/licenseServer";
import { FEATURES } from "../../../lib/plans";
import { reserve, record } from "../../../lib/costControl";
import { failure, fields, LIMITS, rateLimit, readJson, siteContext, z } from "../../../lib/apiGuard";

const Body = z.object({
  idToken: fields.idToken,
  siteId: fields.siteId,
  item: z.object({
    title: fields.text(300, "The title").min(1, "Nothing to write."),
    kind: fields.text(40).nullish(),
    angle: fields.text(1000, "The angle").nullish(),
  }),
  site: siteContext,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The pipeline is four sequential model calls (research, outline, draft,
// fact-check), one of them with web search, so it needs real headroom.
export const maxDuration = 300;

// Availability probe so the UI can tell the truth about whether real writing
// is switched on, instead of advertising a button that can't work.
export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "Real writing isn't switched on yet — no Anthropic API key is configured on the server." },
      { status: 200 }
    );
  }

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, item, site, siteId } = body.data;

  const auth = await authorize(idToken, FEATURES.CONTENT);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const limited = await rateLimit({ scope: "ai.content", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  // Content pieces are metered per month like everything else paid, on top of
  // the general credit reservation — a 900-word article and a 3,000-word pillar
  // both cost one "content piece" against the plan, but the underlying model
  // spend still passes through the shared credit ledger.
  const gate = await reserve({
    orgId: auth.orgId,
    siteId,
    subscription: auth.subscription,
    action: "CONTENT_WRITE",
    job: "content_write",
    contentPieces: 1,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: gate.status || 429 }
    );
  }

  try {
    const result = await writeArticle({
      topic: item.title,
      siteContext: `${site?.name || site?.domain || "this site"} (${site?.domain || ""})`,
      siteUrl: site?.domain ? `https://${site.domain}` : "",
      sitePages: site?.pages || [],
      voice: site?.voice === "a" ? "Short, direct sentences. Plain words. No corporate throat-clearing." : "Professional and thorough, never padded or vague.",
      rules: site?.rules || [],
      authorName: site?.name || null,
    });

    await record(gate.hold, {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      webSearches: result.usage.webSearches,
    });

    return NextResponse.json({
      ok: true,
      article: result.body,
      title: result.title,
      description: result.description,
      words: result.wordCount,
      faqs: result.faqs,
      schema: result.schema,
      internalLinks: result.internalLinks,
      inventedLinksDropped: result.inventedLinksDropped,
      sources: result.sources,
      factCheck: result.factCheck,
      publishable: result.publishable,
      needsReview: result.needsReview,
      researchWasThin: result.researchWasThin,
    });
  } catch (err) {
    // A failed pipeline still burned tokens on whichever stage got furthest;
    // refunding the content-piece credit is right, refunding the token spend
    // that already happened would understate what it actually cost.
    await record(gate.hold, { failed: true });

    if (err?.code === "refused") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "empty") return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    return failure("generate-content", err, "Writing failed partway through. Nothing was charged; try again.", 200);
  }
}
