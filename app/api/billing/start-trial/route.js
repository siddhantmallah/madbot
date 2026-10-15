import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { ensurePersonalOrg } from "../../../../lib/orgs";
import { platformSettings } from "../../../../lib/platform";
import { failure, fields, rateLimit, readJson, requireUser, z } from "../../../../lib/apiGuard";

const Body = z.object({ idToken: fields.idToken, intendedPlan: z.string().max(40).nullish() });
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "../../../../lib/plans";
import { buildWelcomeEmail, sendEmail, usingSandboxSender } from "../../../../lib/email";
import {
  DOMAIN_WINDOW_DAYS,
  claimDomainInTx,
  claimInTx,
  domainLedgerKey,
  domainOf,
  domainTrialTaken,
  ledgerKey,
  readDomainLedgerInTx,
  readLedgerInTx,
  recordAttemptInTx,
} from "../../../../lib/trialLedger";

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
      template: (await platformSettings()).emailTemplates?.welcome,
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

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, intendedPlan = null } = body.data;

  const who = await requireUser(idToken);
  if (!who.ok) return who.response;
  const { uid } = who.user;

  // Called on every sign-in, so the ceiling is generous; it exists to stop a
  // loop, not a person.
  const limited = await rateLimit({ scope: "billing.trial", key: uid, rules: [{ limit: 30, windowSec: 3600 }] });
  if (!limited.ok) return limited.response;

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
  const intent = intendedPlan && Object.hasOwn(PLANS, intendedPlan) && PLANS[intendedPlan].purchasable ? intendedPlan : null;

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  // A trial belongs to the person's own workspace: the organisation whose id
  // is their uid, created here if this is their first sign-in since
  // organisations arrived. Someone who only belongs to other organisations
  // gets one too, so a trial never lands on an organisation somebody else owns.
  const made = await ensurePersonalOrg(db, { uid, email: account.email, displayName: account.displayName });
  if (made.refused === "signups_closed") {
    return NextResponse.json({ ok: true, started: false, reason: "signups-closed", message: "New signups are closed at the moment." });
  }
  const orgDocRef = db.collection("orgs").doc(uid);
  const key = ledgerKey(email);
  const domainKey = domainLedgerKey(email);

  // No key means the address couldn't be normalised, so there is no way to
  // check whether it has had a trial. That used to fall through and grant one,
  // recording nothing, the opposite of what lib/trialLedger.js says the caller
  // does. Refuse instead: the free plan still works.
  if (!key) {
    console.error("[start-trial] no ledger key for a verified address", uid);
    return NextResponse.json({
      ok: true,
      started: false,
      reason: "cannot-check",
      message: "We couldn't confirm this address is eligible for a trial. The free plan is active; write to us and we'll sort it out.",
    });
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      // Every read first — Firestore requires it, and both gates need reading
      // before either can be decided.
      const snap = await tx.get(orgDocRef);
      const ledger = await readLedgerInTx(tx, key);
      const domainLedger = await readDomainLedgerInTx(tx, domainKey);

      // No workspace of their own: they joined someone else's organisation
      // first. The trial is for a new workspace, so there's nothing to start.
      if (!snap.exists) return { started: false, reason: "member-only" };

      const existing = snap.data()?.subscription || null;

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

      // Gate 3 — one trial per custom domain per window. Public mail services
      // have no domain key, so this never applies to them.
      if (domainLedger && domainTrialTaken(domainLedger.data, uid)) {
        tx.set(userRef, { trialRefused: { reason: "domain-used", at: FieldValue.serverTimestamp() } }, { merge: true });
        return { started: false, reason: "domain-used" };
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

      tx.set(orgDocRef, { subscription, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(userRef, { trialEverStarted: true, trialRefused: FieldValue.delete() }, { merge: true });
      if (ledger?.ref) claimInTx(tx, ledger.ref, { uid, emailDomain: domainOf(email) });
      if (domainLedger?.ref) claimDomainInTx(tx, domainLedger.ref, { uid });

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
    if (result.reason === "domain-used") {
      return NextResponse.json({
        ok: true,
        started: false,
        reason: "domain-used",
        message: `Your organisation's domain has had a free trial in the last ${DOMAIN_WINDOW_DAYS} days, so this account starts on the free plan. Ask whoever started it to add you, or choose a paid plan any time.`,
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
      // Whether it went, not the provider's reason why not; that is on the user
      // document for us and in the logs.
      email: email_ ? { ok: !!email_.ok, sandboxSender: !!email_.sandboxSender } : null,
      emailRetried: shouldSend && !result.started,
    });
  } catch (err) {
    return failure("start-trial", err, "The trial couldn't be started just now. Sign in again in a minute to retry.");
  }
}
