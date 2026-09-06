import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "../../../../lib/plans";
import { buildWelcomeEmail, sendEmail, usingSandboxSender } from "../../../../lib/email";
import { claimInTx, domainOf, ledgerKey, readLedgerInTx, recordAttemptInTx } from "../../../../lib/trialLedger";

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
      maxSites: PLANS[TRIAL_PLAN].maxSites,
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
 * Called after every sign-in, not just signup, so it has to be safe to run
 * repeatedly: signup can retry, React can fire an effect twice, and an account
 * created before trials existed needs repairing on its next visit.
 *
 * Two gates, both server-side:
 *
 *   1. The email address must be verified. An unverified address is not
 *      evidence of anything, and a trial that spends real money on model calls
 *      should not be handed to an address nobody has proved they can read.
 *      Google and GitHub sign-ins arrive already verified.
 *
 *   2. One trial per person, enforced through lib/trialLedger.js on a hash of
 *      the normalised address rather than on the account. Checking the account
 *      only stops the same account taking two, which is not the thing worth
 *      stopping.
 *
 * The plan the visitor clicked on the pricing page arrives as intendedPlan and
 * is remembered for the upgrade prompt, but the trial itself always runs at
 * TRIAL_PLAN level. See the note in plans.js.
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

  // Identity comes from Firebase, never from the request body.
  let account;
  try {
    account = await adminAuth().getUser(uid);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read your account." }, { status: 401 });
  }

  const email = account.email || null;
  if (!email) {
    return NextResponse.json({
      ok: true,
      started: false,
      reason: "no-email",
      message: "This account has no email address, so a trial can't be started for it.",
    });
  }

  // Gate 1 — a verified address.
  if (!account.emailVerified) {
    return NextResponse.json({
      ok: true,
      started: false,
      reason: "email-not-verified",
      needsVerification: true,
      email,
      message: "Verify your email address to start your free trial.",
    });
  }

  // Only a real purchasable plan is worth remembering as an intent.
  const intent = intendedPlan && PLANS[intendedPlan]?.purchasable ? intendedPlan : null;

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const key = ledgerKey(email);

  try {
    const result = await db.runTransaction(async (tx) => {
      // Every read first — Firestore requires it, and both gates need reading
      // before either can be decided.
      const snap = await tx.get(userRef);
      const ledger = await readLedgerInTx(tx, key);

      const existing = snap.exists ? snap.data()?.subscription || null : null;

      // Already has a subscription of some kind: a paid plan, a live trial, or
      // a finished one. Nothing to do, and nothing to record.
      if (existing) {
        return { started: false, reason: "already-subscribed", subscription: existing };
      }

      // Gate 2 — has this person already had their trial on another account?
      const claimedByAnother =
        ledger?.exists && !(ledger.data?.uids || []).includes(uid);

      if (claimedByAnother) {
        recordAttemptInTx(tx, ledger.ref, { uid });
        // Written to the user document so the dashboard can say why the account
        // is on the free tier instead of leaving it unexplained.
        tx.set(
          userRef,
          {
            trialRefused: {
              reason: "already-used",
              at: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        return { started: false, reason: "already-used" };
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

      tx.set(userRef, { subscription, trialEverStarted: true, trialRefused: FieldValue.delete() }, { merge: true });
      if (ledger?.ref) claimInTx(tx, ledger.ref, { uid, emailDomain: domainOf(email) });

      // No billing row: a trial isn't a payment, and inventing a zero-value
      // receipt would clutter a record that should only show real money.
      tx.set(userRef.collection("billingEvents").doc("trial_start"), {
        type: "trial_start",
        plan: TRIAL_PLAN,
        intendedPlan: intent,
        provider: "none",
        days: TRIAL_DAYS,
        appliedAt: FieldValue.serverTimestamp(),
      });

      return { started: true, subscription };
    });

    if (result.reason === "already-used") {
      return NextResponse.json({
        ok: true,
        started: false,
        reason: "already-used",
        message:
          "A free trial has already been used for this email address. You can still use the free plan, or choose a paid plan any time.",
      });
    }

    // Welcome mail rides on the trial starting. A failure is recorded, not
    // thrown — losing the email is bad, losing the trial because of the email
    // is worse.
    //
    // It also retries on a later sign-in if it previously failed. Without that,
    // every account created before the sending domain was verified would never
    // get one, since the trial only ever starts once.
    let email_ = null;
    const previous = (await userRef.get()).data()?.welcomeEmail || null;
    const shouldSend = result.started || (previous && previous.ok === false);
    if (shouldSend) {
      email_ = await sendWelcome(uid, intent || result.subscription?.intendedPlan || null);
      await userRef.set({ welcomeEmail: { ...email_, retried: !result.started } }, { merge: true });
    }

    return NextResponse.json({
      ok: true,
      ...result,
      trialDays: TRIAL_DAYS,
      email: email_,
      emailRetried: shouldSend && !result.started,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
