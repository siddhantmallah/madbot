import { NextResponse } from "next/server";
import { writeArticle } from "../../../lib/contentPipeline";
import { authorize } from "../../../lib/licenseServer";
import { FEATURES } from "../../../lib/plans";
import { reserve, record } from "../../../lib/costControl";

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, item, site, siteId } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!item?.title) return NextResponse.json({ ok: false, error: "Nothing to write." }, { status: 400 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });

  const auth = await authorize(idToken, FEATURES.CONTENT);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }

  // Content pieces are metered per month like everything else paid, on top of
  // the general credit reservation — a 900-word article and a 3,000-word pillar
  // both cost one "content piece" against the plan, but the underlying model
  // spend still passes through the shared credit ledger.
  const gate = await reserve({
    uid: auth.uid,
    siteId,
    subscription: auth.subscription,
    action: "CONTENT_WRITE",
    job: "content_write",
    contentPieces: 1,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: 429 }
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
    return NextResponse.json({ ok: false, error: `Writing failed: ${String(err?.message || err).slice(0, 200)}` }, { status: 200 });
  }
}
