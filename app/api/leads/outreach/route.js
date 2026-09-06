import { NextResponse } from "next/server";
import { draftOutreachEmail } from "../../../../lib/leadEngine";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, lead, profile, site } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });
  if (!lead?.domain) return NextResponse.json({ ok: false, error: "No lead given." }, { status: 400 });
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

  const gate = await reserve({
    uid: auth.uid,
    siteId,
    subscription: auth.subscription,
    action: "OUTREACH_DRAFT",
    job: "lead_outreach",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: 429 }
    );
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

    return NextResponse.json({
      ok: true,
      subject: draft.subject,
      body: draft.body,
      confidence: draft.confidence,
      claims: draft.claims,
    });
  } catch (err) {
    await record(gate.hold, { failed: true });
    if (err?.code === "refused") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "empty") return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    return NextResponse.json({ ok: false, error: `Drafting failed: ${String(err?.message || err).slice(0, 200)}` }, { status: 200 });
  }
}
