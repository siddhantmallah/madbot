// The gate every paid operation goes through.
//
// Nothing in MADBOT may call a model, a data provider or a mail API directly.
// The reason is arithmetic: a single AI visibility run is roughly 80k input
// tokens plus billed web searches. A customer on the ₹1,499 plan who triggers
// that thirty times has cost more than they pay. Without a check in front of
// every call, one enthusiastic month wipes out the margin on a year.
//
// The shape is: reserve before, record after.
//
//   reserve()  → checks plan allowance and daily spend cap, holds the credits
//   record()   → replaces the estimate with the real cost from the response
//
// Reserving first matters. Recording after the fact means the budget is only
// ever enforced retrospectively, which is another way of saying not enforced.

import { FieldValue } from "firebase-admin/firestore";
import { adminAvailable, adminDb } from "./firebaseAdmin";
import { activePlan } from "./entitlements";
import { creditsFor, ACTIONS } from "./credits";
import { estimateCost } from "./aiModels";

/**
 * A hard ceiling on what one site can spend in a day, whatever its plan
 * allowance says. The monthly allowance stops sustained overuse; this stops a
 * loop, a bug or a bad actor turning a month's budget into an afternoon's.
 */
const DAILY_USD_CAP = { free: 0.25, starter: 1.5, growth: 4, pro: 12, agency: 30, lapsed: 0 };

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function usageRef(db, uid, siteId, period) {
  return db.collection("users").doc(uid).collection("sites").doc(siteId).collection("usage").doc(period);
}

/**
 * Reads a site's usage for the current month, plus today's spend.
 * Returns zeros for a period with no record — an absent document means nothing
 * has been spent, not an error.
 */
export async function usageFor(uid, siteId) {
  if (!adminAvailable()) return null;
  const db = adminDb();
  const [month, day] = await Promise.all([
    usageRef(db, uid, siteId, monthKey()).get(),
    usageRef(db, uid, siteId, `day-${dayKey()}`).get(),
  ]);
  const m = month.exists ? month.data() : {};
  const d = day.exists ? day.data() : {};
  return {
    period: monthKey(),
    credits: m.credits || 0,
    leadCredits: m.leadCredits || 0,
    emails: m.emails || 0,
    contentPieces: m.contentPieces || 0,
    costUsd: m.costUsd || 0,
    inputTokens: m.inputTokens || 0,
    outputTokens: m.outputTokens || 0,
    webSearches: m.webSearches || 0,
    todayCostUsd: d.costUsd || 0,
  };
}

/**
 * Asks permission to run one action.
 *
 * Returns { ok: true, hold } or { ok: false, reason, code, upgradeTo }.
 * A refusal is a normal outcome, not an error — the caller turns it into an
 * "you've used this month's allowance" message with a way forward.
 */
export async function reserve({ uid, siteId, subscription, action, job, leadCredits = 0, emails = 0, contentPieces = 0 }) {
  if (!adminAvailable()) {
    return { ok: false, code: "no_admin", reason: "Usage metering is unavailable — the server has no service account." };
  }
  if (!ACTIONS[action]) {
    return { ok: false, code: "unknown_action", reason: `Unknown action "${action}".` };
  }

  const plan = activePlan(subscription);
  const cost = creditsFor(action);
  const usage = await usageFor(uid, siteId);

  // Monthly allowances.
  if (usage.credits + cost > plan.credits) {
    return {
      ok: false,
      code: "credits_exhausted",
      reason: `You've used this month's ${plan.credits.toLocaleString()} autonomous actions on ${plan.name}.`,
      used: usage.credits,
      allowance: plan.credits,
    };
  }
  if (leadCredits && usage.leadCredits + leadCredits > plan.leadCredits) {
    return {
      ok: false,
      code: "leads_exhausted",
      reason: `You've used this month's ${plan.leadCredits.toLocaleString()} lead credits.`,
      used: usage.leadCredits,
      allowance: plan.leadCredits,
    };
  }
  if (emails && usage.emails + emails > plan.emails) {
    return {
      ok: false,
      code: "emails_exhausted",
      reason: `You've sent this month's ${plan.emails.toLocaleString()} outreach emails.`,
      used: usage.emails,
      allowance: plan.emails,
    };
  }
  if (contentPieces && usage.contentPieces + contentPieces > plan.contentPieces) {
    return {
      ok: false,
      code: "content_exhausted",
      reason: `You've used this month's ${plan.contentPieces} content pieces on ${plan.name}.`,
      used: usage.contentPieces,
      allowance: plan.contentPieces,
    };
  }

  // The daily circuit breaker, checked against a pessimistic estimate.
  const cap = DAILY_USD_CAP[plan.id] ?? 0;
  const estimate = job ? estimateCost({ job }) : 0;
  if (cap > 0 && usage.todayCostUsd + estimate > cap) {
    return {
      ok: false,
      code: "daily_cap",
      reason: "MADBOT has hit today's spending limit for this site. It resumes tomorrow.",
      spentToday: Number(usage.todayCostUsd.toFixed(4)),
      cap,
    };
  }
  if (cap === 0) {
    return {
      ok: false,
      code: "no_budget",
      reason: `${plan.name} doesn't include paid actions.`,
    };
  }

  // Hold the allowance now. A crash between here and record() over-counts the
  // customer by one action, which is the right way round to be wrong.
  const db = adminDb();
  await Promise.all([
    usageRef(db, uid, siteId, monthKey()).set(
      {
        credits: FieldValue.increment(cost),
        ...(leadCredits ? { leadCredits: FieldValue.increment(leadCredits) } : {}),
        ...(emails ? { emails: FieldValue.increment(emails) } : {}),
        ...(contentPieces ? { contentPieces: FieldValue.increment(contentPieces) } : {}),
        costUsd: FieldValue.increment(estimate),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    usageRef(db, uid, siteId, `day-${dayKey()}`).set(
      { costUsd: FieldValue.increment(estimate), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    ),
  ]);

  // Every dimension held is carried on the hold, not just credits — record()
  // needs all of them to refund a failure correctly.
  return { ok: true, hold: { uid, siteId, action, job, estimate, credits: cost, leadCredits, emails, contentPieces } };
}

/**
 * Replaces a hold's estimate with what the call actually cost. Called with the
 * usage figures from the model response, so recorded spend tracks the real bill
 * rather than a guess.
 */
export async function record(hold, { inputTokens = 0, outputTokens = 0, webSearches = 0, failed = false } = {}) {
  if (!hold || !adminAvailable()) return;
  const { uid, siteId, job, estimate, credits, leadCredits, emails, contentPieces } = hold;
  const db = adminDb();

  const { costOf } = await import("./aiModels");
  const actual = job ? costOf({ job, inputTokens, outputTokens, webSearches }) : 0;
  const delta = actual - estimate;

  const patch = {
    costUsd: FieldValue.increment(delta),
    inputTokens: FieldValue.increment(inputTokens),
    outputTokens: FieldValue.increment(outputTokens),
    webSearches: FieldValue.increment(webSearches),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // A failed call still cost whatever it burned before failing, but the
  // customer shouldn't pay any of the allowances for work they didn't get.
  // This used to refund only credits — a failed content piece or a failed lead
  // qualification still silently consumed the customer's monthly content or
  // lead allowance even though nothing was delivered.
  if (failed) {
    patch.credits = FieldValue.increment(-credits);
    if (leadCredits) patch.leadCredits = FieldValue.increment(-leadCredits);
    if (emails) patch.emails = FieldValue.increment(-emails);
    if (contentPieces) patch.contentPieces = FieldValue.increment(-contentPieces);
  }

  await Promise.all([
    usageRef(db, uid, siteId, monthKey()).set(patch, { merge: true }),
    usageRef(db, uid, siteId, `day-${dayKey()}`).set(
      { costUsd: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    ),
  ]);
}

/**
 * Wraps one paid call: reserve, run, record. Use this rather than calling
 * reserve and record by hand — it can't forget to record, including when the
 * call throws.
 */
export async function metered({ uid, siteId, subscription, action, job, leadCredits, emails, contentPieces }, run) {
  const gate = await reserve({ uid, siteId, subscription, action, job, leadCredits, emails, contentPieces });
  if (!gate.ok) return { ok: false, ...gate };

  try {
    // `run` reports its own token usage so the real cost can be recorded.
    const { result, usage } = await run();
    await record(gate.hold, usage || {});
    return { ok: true, result };
  } catch (err) {
    await record(gate.hold, { failed: true });
    throw err;
  }
}

export { DAILY_USD_CAP };
