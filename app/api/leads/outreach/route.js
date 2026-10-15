import { NextResponse } from "next/server";
import { draftOutreachEmail } from "../../../../lib/leadEngine";
import { authorize } from "../../../../lib/licenseServer";
import { adminAuth } from "../../../../lib/firebaseAdmin";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";
import { failure, fields, LIMITS, rateLimit, readJson, siteContext, z } from "../../../../lib/apiGuard";

// What goes into the drafting prompt about the company and about who buys.
// Passthrough because the lead and profile records carry more than the prompt
// reads; the body cap bounds the whole thing.
const Body = z.object({
  idToken: fields.idToken,
  siteId: fields.siteId,
  lead: z
    .object({
      domain: fields.domain.min(1, "No lead given."),
      contactEmail: fields.text(320).nullish(),
      co: fields.text(300).nullish(),
      why: fields.text(4000).nullish(),
      openingLine: fields.text(1000).nullish(),
      problemYouSolve: fields.text(2000).nullish(),
    })
    .passthrough(),
  profile: z.object({}).passthrough().nullish(),
  site: siteContext,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Whether drafting works is answered by /api/ai-status, which makes a live call.
export async function GET() {
  return NextResponse.json({ ok: true, aiStatusAt: "/api/ai-status" });
}

/**
 * Drafts one outreach email for one qualified lead.
 *
 * Drafts only. The result goes to the approvals queue, and sending it is a
 * person opening their own mail client — this route never touches Resend, and
 * nothing here can put a cold email on the wire.
 *
 * Gated on the outreach feature, and metered as OUTREACH_DRAFT: the credit and
 * the model job for this existed in the config for some time with nothing
 * calling them, which is how "Draft an email for approval" came to write one
 * sentence and call it a draft.
 */
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "Drafting isn't switched on — no Anthropic API key is configured on the server." },
      { status: 200 }
    );
  }

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId, lead, profile, site } = body.data;
  if (!lead.contactEmail) {
    return NextResponse.json({ ok: false, error: "This company has no published address to write to." }, { status: 400 });
  }

  const auth = await authorize(idToken, FEATURES.OUTREACH);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const limited = await rateLimit({ scope: "ai.outreach", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  const gate = await reserve({
    orgId: auth.orgId,
    siteId,
    subscription: auth.subscription,
    action: "OUTREACH_DRAFT",
    job: "lead_outreach",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: gate.status || 429 }
    );
  }

  // The prompt asks the model to end on a [Your name] placeholder so it never
  // invents a signature. Nothing was substituting it, so the placeholder went
  // out in the approved email. The name comes from the verified account, not
  // from the request.
  let signOff = null;
  try {
    const account = await adminAuth().getUser(auth.uid);
    signOff = account.displayName || null;
  } catch {
    // Falls through to the generic sign-off below.
  }

  try {
    const draft = await draftOutreachEmail({
      lead,
      profile: profile || null,
      siteContext: {
        name: site?.name || site?.domain || "this business",
        domain: site?.domain || "",
        summary: site?.summary || "",
      },
      voice:
        site?.voice === "a"
          ? "Short, direct sentences. Plain words. No corporate throat-clearing."
          : "Professional and thorough, never padded or vague.",
      rules: site?.rules || [],
    });

    await record(gate.hold, draft.usage);

    // Replace the sign-off placeholder here rather than in the prompt, so the
    // model never has to guess at a name and the customer never sees the
    // token. Falling back to their own site's name is better than leaving
    // "[Your name]" in an email they are about to send.
    const signature = signOff || site?.name || site?.domain || null;
    const body = signature
      ? String(draft.body || "").replaceAll("[Your name]", signature)
      : String(draft.body || "").replaceAll("[Your name]", "").trimEnd();

    return NextResponse.json({
      ok: true,
      subject: draft.subject,
      body,
      confidence: draft.confidence,
      claims: draft.claims,
    });
  } catch (err) {
    await record(gate.hold, { failed: true });
    if (err?.code === "refused") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "empty") return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    return failure("leads.outreach", err, "Drafting failed. Nothing was charged; try again.", 200);
  }
}
