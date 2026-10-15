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
import { siteForPaidWork } from "./siteLimits";

/**
 * A hard ceiling on what one account can spend in a day, whatever its plan
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

function usageRef(db, orgId, siteId, period) {
  return db.collection("users").doc(orgId).collection("sites").doc(siteId).collection("usage").doc(period);
}

// The account's counters, and the ones that limit. A plan's allowance is for
// the whole account, shared across every site it covers (decided 2026-10-14):
// Growth is 1,450 actions a month in total, not 1,450 on each of three sites.
// The per-site counters above are still kept, so usage can be broken down by
// site, but nothing is refused on them. Unlike them, this ledger can't be reset
// by deleting a site or naming one that was never used. The owner may read it
// (Billing shows it); only the server writes it.
function accountUsageRef(db, orgId, period) {
  return db.collection("users").doc(orgId).collection("usage").doc(period);
}

const COUNTERS = ["credits", "leadCredits", "emails", "contentPieces", "socialPosts"];

function readCounters(data) {
  const d = data || {};
  return {
    credits: d.credits || 0,
    leadCredits: d.leadCredits || 0,
    emails: d.emails || 0,
    contentPieces: d.contentPieces || 0,
    socialPosts: d.socialPosts || 0,
    costUsd: d.costUsd || 0,
  };
}

/**
 * The verdict, with no I/O: may this action run, given what the account has
 * already used this month and today? Pure so it can be tested without a
 * database.
 *
 * `want` is what the action would add: { credits, leadCredits, emails,
 * contentPieces, socialPosts, estimate }. Returns { ok: true } or the refusal
 * reserve() hands back.
 */
export function checkAllowance({ plan, account, accountToday, want }) {
  const allowance = {
    credits: plan.credits || 0,
    leadCredits: plan.leadCredits || 0,
    emails: plan.emails || 0,
    contentPieces: plan.contentPieces || 0,
    socialPosts: plan.socialPosts || 0,
  };

  if (account.credits + want.credits > allowance.credits) {
    return {
      ok: false,
      code: "credits_exhausted",
      reason: `You've used this month's ${allowance.credits.toLocaleString()} autonomous actions on ${plan.name}.`,
      used: account.credits,
      allowance: allowance.credits,
    };
  }
  if (want.leadCredits && account.leadCredits + want.leadCredits > allowance.leadCredits) {
    return {
      ok: false,
      code: "leads_exhausted",
      reason: `You've used this month's ${allowance.leadCredits.toLocaleString()} lead credits.`,
      used: account.leadCredits,
      allowance: allowance.leadCredits,
    };
  }
  if (want.emails && account.emails + want.emails > allowance.emails) {
    return {
      ok: false,
      code: "emails_exhausted",
      reason: `You've sent this month's ${allowance.emails.toLocaleString()} outreach emails.`,
      used: account.emails,
      allowance: allowance.emails,
    };
  }
  if (want.contentPieces && account.contentPieces + want.contentPieces > allowance.contentPieces) {
    return {
      ok: false,
      code: "content_exhausted",
      reason: `You've used this month's ${allowance.contentPieces} content pieces on ${plan.name}.`,
      used: account.contentPieces,
      allowance: allowance.contentPieces,
    };
  }
  // Counted per post rather than per drafting run, because a run that drafts for
  // four networks produces four things that can go out. Charging one would let a
  // Growth customer publish 160 posts against an allowance of 40.
  if (want.socialPosts && account.socialPosts + want.socialPosts > allowance.socialPosts) {
    return {
      ok: false,
      code: "social_exhausted",
      reason: allowance.socialPosts
        ? `You've used this month's ${allowance.socialPosts.toLocaleString()} social posts on ${plan.name}.`
        : `${plan.name} doesn't include social posting.`,
      used: account.socialPosts,
      allowance: allowance.socialPosts,
    };
  }

  // The daily circuit breaker, checked against a pessimistic estimate.
  const cap = DAILY_USD_CAP[plan.id] ?? 0;
  if (cap === 0) {
    return { ok: false, code: "no_budget", reason: `${plan.name} doesn't include paid actions.` };
  }
  if (accountToday.costUsd + want.estimate > cap) {
    return {
      ok: false,
      code: "daily_cap",
      reason: "MADBOT has hit today's spending limit for this account. It resumes tomorrow.",
      spentToday: Number(accountToday.costUsd.toFixed(4)),
      cap,
    };
  }
  return { ok: true };
}

/**
 * Reads a site's usage for the current month, plus today's spend.
 * Returns zeros for a period with no record — an absent document means nothing
 * has been spent, not an error.
 */
export async function usageFor(orgId, siteId) {
  if (!adminAvailable()) return null;
  const db = adminDb();
  const [month, day] = await Promise.all([
    usageRef(db, orgId, siteId, monthKey()).get(),
    usageRef(db, orgId, siteId, `day-${dayKey()}`).get(),
  ]);
  const m = month.exists ? month.data() : {};
  const d = day.exists ? day.data() : {};
  return {
    period: monthKey(),
    credits: m.credits || 0,
    leadCredits: m.leadCredits || 0,
    emails: m.emails || 0,
    contentPieces: m.contentPieces || 0,
    socialPosts: m.socialPosts || 0,
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
export async function reserve({
  orgId,
  siteId,
  subscription,
  action,
  job,
  leadCredits = 0,
  emails = 0,
  contentPieces = 0,
  socialPosts = 0,
}) {
  if (!adminAvailable()) {
    return { ok: false, code: "no_admin", reason: "Usage metering is unavailable — the server has no service account." };
  }
  if (!ACTIONS[action]) {
    return { ok: false, code: "unknown_action", reason: `Unknown action "${action}".` };
  }

  const plan = activePlan(subscription);
  const cost = creditsFor(action);
  const estimate = job ? estimateCost({ job }) : 0;
  const db = adminDb();

  // A real site on this account, inside the plan's limit. The allowance is the
  // account's, but the work still has to be for a site the plan covers.
  const gate = await siteForPaidWork(db, orgId, siteId, plan);
  if (!gate.ok) return { ok: false, code: gate.code, reason: gate.reason, status: gate.status };

  const month = monthKey();
  const day = `day-${dayKey()}`;
  const refs = {
    siteMonth: usageRef(db, orgId, siteId, month),
    siteDay: usageRef(db, orgId, siteId, day),
    accountMonth: accountUsageRef(db, orgId, month),
    accountDay: accountUsageRef(db, orgId, day),
  };
  const want = { credits: cost, leadCredits, emails, contentPieces, socialPosts, estimate };

  // Check and hold in one transaction. Reading, deciding and then incrementing
  // as three separate steps let ten simultaneous requests all read the same
  // "nine left" and all go ahead.
  const verdict = await db.runTransaction(async (tx) => {
    const [am, ad] = await Promise.all([tx.get(refs.accountMonth), tx.get(refs.accountDay)]);
    let account = readCounters(am.data());

    // The account ledger is newer than the per-site counters. The first time
    // an account spends in a month with no seeded ledger, it starts from what
    // its sites have already used this month rather than from zero, so the
    // switch to account-wide allowances doesn't hand out a fresh month. A
    // partial ledger (written by record() before seeding) is the same spending
    // counted twice over, so each counter takes the larger of the two.
    const seeding = !am.exists || !am.data()?.seeded;
    if (seeding) {
      const siteMonths = await Promise.all(gate.siteIds.map((id) => tx.get(usageRef(db, orgId, id, month))));
      const summed = siteMonths.reduce((acc, snap) => {
        const c = readCounters(snap.data());
        for (const k of [...COUNTERS, "costUsd"]) acc[k] += c[k];
        return acc;
      }, readCounters(null));
      for (const k of [...COUNTERS, "costUsd"]) account[k] = Math.max(account[k], summed[k]);
    }

    const decision = checkAllowance({ plan, account, accountToday: readCounters(ad.data()), want });
    if (!decision.ok) return decision;

    // Hold the allowance now. A crash between here and record() over-counts
    // the customer by one action, which is the right way round to be wrong.
    const held = {
      credits: FieldValue.increment(cost),
      ...(leadCredits ? { leadCredits: FieldValue.increment(leadCredits) } : {}),
      ...(emails ? { emails: FieldValue.increment(emails) } : {}),
      ...(contentPieces ? { contentPieces: FieldValue.increment(contentPieces) } : {}),
      ...(socialPosts ? { socialPosts: FieldValue.increment(socialPosts) } : {}),
      costUsd: FieldValue.increment(estimate),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const spent = { costUsd: FieldValue.increment(estimate), updatedAt: FieldValue.serverTimestamp() };
    tx.set(refs.siteMonth, held, { merge: true });
    tx.set(refs.siteDay, spent, { merge: true });
    if (seeding) {
      // Absolute values, not increments: the seed already includes the old
      // counts, and this write is what makes the ledger whole.
      const after = Object.fromEntries([...COUNTERS, "costUsd"].map((k) => [k, account[k] + (want[k === "costUsd" ? "estimate" : k] || 0)]));
      tx.set(refs.accountMonth, { ...after, seeded: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      tx.set(refs.accountMonth, held, { merge: true });
    }
    tx.set(refs.accountDay, spent, { merge: true });
    return decision;
  });
  if (!verdict.ok) return verdict;

  // Every dimension held is carried on the hold, not just credits — record()
  // needs all of them to refund a failure correctly.
  return {
    ok: true,
    site: gate.site,
    hold: { orgId, siteId, action, job, estimate, credits: cost, leadCredits, emails, contentPieces, socialPosts },
  };
}

/**
 * Replaces a hold's estimate with what the call actually cost. Called with the
 * usage figures from the model response, so recorded spend tracks the real bill
 * rather than a guess.
 */
export async function record(hold, { inputTokens = 0, outputTokens = 0, webSearches = 0, failed = false } = {}) {
  if (!hold || !adminAvailable()) return;
  const { orgId, siteId, job, estimate, credits, leadCredits, emails, contentPieces, socialPosts } = hold;
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
    if (socialPosts) patch.socialPosts = FieldValue.increment(-socialPosts);
  }

  const daily = { costUsd: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() };
  await Promise.all([
    usageRef(db, orgId, siteId, monthKey()).set(patch, { merge: true }),
    usageRef(db, orgId, siteId, `day-${dayKey()}`).set(daily, { merge: true }),
    accountUsageRef(db, orgId, monthKey()).set(patch, { merge: true }),
    accountUsageRef(db, orgId, `day-${dayKey()}`).set(daily, { merge: true }),
  ]);
}

/**
 * Wraps one paid call: reserve, run, record. Use this rather than calling
 * reserve and record by hand — it can't forget to record, including when the
 * call throws.
 */
export async function metered({ orgId, siteId, subscription, action, job, leadCredits, emails, contentPieces, socialPosts }, run) {
  const gate = await reserve({ orgId, siteId, subscription, action, job, leadCredits, emails, contentPieces, socialPosts });
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
