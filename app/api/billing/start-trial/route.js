import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "../../../../lib/plans";
import { buildWelcomeEmail, sendEmail, usingSandboxSender } from "../../../../lib/email";

/**
 * Sends the welcome mail. The recipient comes from Firebase Auth rather than
 * the request, so this can't be pointed at somebody else's inbox.
 */
async function sendWelcome(uid, intendedPlan) {
  try {
    const auth = adminAuth();
    if (!auth) return { ok: false, error: "No service account configured.", at: new Date() };
    const user = await auth.getUser(uid);
    if (!user.email) return { ok: false, error: "Account has no email address.", at: new Date() };

    const { subject, html, text } = buildWelcomeEmail({
      name: user.displayName,
      planName: PLANS[TRIAL_PLAN].name,
      intendedPlanName: intendedPlan ? PLANS[intendedPlan].name : null,
      trialDays: TRIAL_DAYS,
      siteUrl: null,
    });

    const result = await sendEmail({ to: user.email, subject, html, text });
    return {
      ...result,
      // Surfaces the most common cause of silent non-delivery: the sandbox
      // sender only reaches the Resend account's own address.
      sandboxSender: usingSandboxSender(),
      at: new Date(),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), at: new Date() };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a new account's free trial.
 *
 * Called once, right after signup. The plan the visitor clicked on the pricing
 * page arrives as intendedPlan and is remembered for the upgrade prompt, but
 * the trial itself always runs at TRIAL_PLAN level — see the note in plans.js.
 *
 * Refuses to start a second trial for the same account. Idempotent, because
 * signup can retry and React can fire an effect twice.
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

  const { idToken, intendedPlan = null } = body || {};
  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  // Only a real purchasable plan is worth remembering as an intent.
  const intent = intendedPlan && PLANS[intendedPlan]?.purchasable ? intendedPlan : null;

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const existing = snap.exists ? snap.data()?.subscription || null : null;

      // Already has any subscription history — a paid plan, a live trial, or a
      // finished one. Starting another would hand out free time on demand.
      if (existing) {
        return { started: false, reason: "already has a subscription", subscription: existing };
      }

      const now = new Date();
      const ends = new Date(now.getTime() + TRIAL_DAYS * 86400000);
      const subscription = {
        plan: TRIAL_PLAN,
        status: "trialing",
        provider: "none",
        intendedPlan: intent,
        currentPeriodStart: now,
        currentPeriodEnd: ends,
        trialStartedAt: now,
        trialEndsAt: ends,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      };

      tx.set(userRef, { subscription, trialEverStarted: true }, { merge: true });
      // No billing row: a trial isn't a payment, and inventing a zero-value
      // receipt would clutter a record that should only show real money.
      tx.set(userRef.collection("billingEvents").doc(`trial_start`), {
        type: "trial_start",
        plan: TRIAL_PLAN,
        intendedPlan: intent,
        provider: "none",
        days: TRIAL_DAYS,
        appliedAt: FieldValue.serverTimestamp(),
      });

      return { started: true, subscription };
    });

    // Welcome mail rides on the trial starting, because that happens exactly
    // once per account. A failure is recorded, not thrown — losing the email is
    // bad, losing the trial because of the email is worse.
    let email = null;
    if (result.started) {
      email = await sendWelcome(uid, intent);
      await userRef.set({ welcomeEmail: email }, { merge: true });
    }

    return NextResponse.json({ ok: true, ...result, trialDays: TRIAL_DAYS, email });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
