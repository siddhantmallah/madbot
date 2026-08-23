import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { applyBillingEvent, isAdmin } from "../../../../lib/billingAdmin";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { PLANS } from "../../../../lib/plans";

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, email, uid: targetUidRaw, plan, months = 1, amountMinor = null, currency = "USD", note = null, type = "activate" } = body || {};

  const actorUid = await verifiedUid(idToken);
  if (!actorUid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!isAdmin(actorUid)) {
    // Deliberately vague: a non-admin doesn't need to learn this endpoint works.
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  if (!PLANS[plan] && ["activate", "renew"].includes(type)) {
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
      const { getAuth } = await import("firebase-admin/auth");
      const user = await getAuth().getUserByEmail(email);
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
      months: Number(months) || 1,
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
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 400 });
  }
}
