import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { applyBillingEvent, isAdmin } from "../../../../lib/billingAdmin";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { PLANS, REGIONS } from "../../../../lib/plans";
import { z } from "../../../../lib/apiGuard";

// `plan` is checked against PLANS' own keys. A bare PLANS[plan] lookup accepted
// "constructor" and stored a plan with no features, which then threw inside
// every scheduler tick.
const PLAN_IDS = Object.keys(PLANS);
const CURRENCIES = [...new Set(Object.values(REGIONS).map((r) => r.currency))];

const Body = z.object({
  idToken: z.string(),
  email: z.email().max(320).optional(),
  uid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  type: z.enum(["activate", "renew", "cancel", "expire", "refund"]).default("activate"),
  months: z.number().int().min(1).max(36).default(1),
  amountMinor: z.number().int().min(0).max(1e10).nullish().default(null),
  currency: z.enum(CURRENCIES).default("USD"),
  note: z.string().max(500).nullish().default(null),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grants a licence by hand.
 *
 * This is how a customer gets served when they've paid by bank transfer and no
 * payment provider is connected yet — which is the situation for an
 * unregistered business. It runs through the same applyBillingEvent seam a
 * provider webhook will, so switching to automated billing later doesn't change
 * how entitlements are stored.
 *
 * Restricted to uids listed in ADMIN_UIDS. With that unset, nobody qualifies.
 */
export async function POST(request) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  // The admin check comes before the schema, so a non-admin gets the same
  // vague 404 whatever they send rather than learning the body's shape from
  // validation errors.
  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const actorUid = await verifiedUid(raw?.idToken);
  if (!actorUid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!isAdmin(actorUid)) {
    // Deliberately vague: a non-admin doesn't need to learn this endpoint works.
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: `Invalid ${issue?.path?.join(".") || "request"}: ${issue?.message}` },
      { status: 400 }
    );
  }
  const { email, uid: targetUidRaw, plan, months, amountMinor, currency, note, type } = parsed.data;

  if (!plan && ["activate", "renew"].includes(type)) {
    return NextResponse.json(
      { ok: false, error: `Unknown plan. One of: ${Object.keys(PLANS).join(", ")}` },
      { status: 400 }
    );
  }

  // Accept an email for convenience — reading a uid out of the Firebase console
  // is fiddly and easy to get wrong.
  let targetUid = targetUidRaw || null;
  if (!targetUid && email) {
    try {
      const user = await adminAuth().getUserByEmail(email);
      targetUid = user.uid;
    } catch {
      return NextResponse.json({ ok: false, error: `No account found for ${email}.` }, { status: 404 });
    }
  }
  if (!targetUid) {
    return NextResponse.json({ ok: false, error: "Pass an email or uid." }, { status: 400 });
  }

  try {
    const result = await applyBillingEvent({
      // Deterministic enough that a double-click can't grant two periods, but
      // distinct per grant so a genuine renewal still applies.
      eventId: `manual_${targetUid}_${type}_${plan || "none"}_${new Date().toISOString().slice(0, 16)}`,
      uid: targetUid,
      type,
      plan,
      provider: "manual",
      months,
      amountMinor,
      currency,
      note,
      actorUid,
    });

    const snap = await adminDb().collection("users").doc(targetUid).get();
    return NextResponse.json({
      ok: true,
      ...result,
      uid: targetUid,
      subscription: snap.data()?.subscription || null,
    });
  } catch (err) {
    // Admin-only, so the detail is useful rather than a leak, but it is still
    // logged so a failed grant leaves a trace beyond one person's terminal.
    console.error("[billing.grant]", err?.stack || err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 400 });
  }
}
