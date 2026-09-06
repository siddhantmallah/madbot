// lib/costControl.js — the gate every paid operation goes through.
//
// reserve(), record(), metered() and usageFor() all need Firestore: they read
// and write users/{uid}/sites/{siteId}/usage/{period} through firebase-admin,
// and every one of them short-circuits on adminAvailable() when no service
// account is configured. None of their branch logic can be reached from a pure
// test without a database or a mock of the admin SDK.
//
// What IS pure and worth pinning down is the shape of DAILY_USD_CAP and its
// relationship to the plan table and the credit ladder — a cap with no entry for
// a plan silently becomes 0, which turns every paid action on that plan into
// "no_budget", and a cap set below the price of a single permitted action sells
// a feature that can never run.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const { PLANS, PLAN_ORDER, FEATURES } = await import("../lib/plans.js");
const { ACTIONS, CREDIT_USD } = await import("../lib/credits.js");
const costControl = await import("../lib/costControl.js");

const { DAILY_USD_CAP } = costControl;

test("lib/costControl.js imports cleanly with no service account present", () => {
  // Worth asserting: the module pulls in firebase-admin/firestore at load time,
  // and a throw here would break every route that imports it.
  assert.equal(typeof costControl.reserve, "function");
  assert.equal(typeof costControl.record, "function");
  assert.equal(typeof costControl.metered, "function");
  assert.equal(typeof costControl.usageFor, "function");
});

test("DAILY_USD_CAP has an entry for every plan in PLANS, including lapsed", () => {
  for (const id of Object.keys(PLANS)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DAILY_USD_CAP, id),
      `no daily cap for plan "${id}" — reserve() reads DAILY_USD_CAP[plan.id] ?? 0, so this plan would refuse every paid action with "no_budget"`
    );
    assert.equal(typeof DAILY_USD_CAP[id], "number", `DAILY_USD_CAP.${id} is not a number`);
    assert.ok(DAILY_USD_CAP[id] >= 0, `DAILY_USD_CAP.${id} is negative`);
  }
});

test("DAILY_USD_CAP has no entry for a plan that does not exist", () => {
  for (const id of Object.keys(DAILY_USD_CAP)) {
    assert.ok(PLANS[id], `DAILY_USD_CAP has a cap for "${id}", which is not a plan`);
  }
});

test("the daily cap ascends with the plan ladder", () => {
  const ordered = PLAN_ORDER.map((id) => DAILY_USD_CAP[id]);
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(
      ordered[i] > ordered[i - 1],
      `${PLAN_ORDER[i]} ($${ordered[i]}) does not have a higher daily cap than ${PLAN_ORDER[i - 1]} ($${ordered[i - 1]})`
    );
  }
});

test("lapsed has a zero cap, so a lapsed customer spends nothing", () => {
  assert.equal(DAILY_USD_CAP.lapsed, 0);
});

test("every purchasable plan has a nonzero cap, so a paying customer is never refused with no_budget", () => {
  for (const id of PLAN_ORDER) {
    assert.ok(DAILY_USD_CAP[id] > 0, `${id} has a zero daily cap — reserve() would return no_budget for every action`);
  }
});

test("the monthly credit allowance binds before the daily cap, so the cap stays a circuit breaker", () => {
  // If 30 days at the daily cap were cheaper than the monthly allowance, the
  // "1,450 autonomous actions" a customer bought would be unreachable.
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    const monthlyHeadroom = plan.credits * CREDIT_USD;
    const capMonth = DAILY_USD_CAP[id] * 30;
    assert.ok(
      capMonth >= monthlyHeadroom,
      `${id}: the daily cap allows only $${capMonth.toFixed(2)} a month but the plan sells $${monthlyHeadroom.toFixed(2)} of credits — the customer could not spend what they bought`
    );
  }
});

test("a single permitted action always fits inside the plan's daily cap", () => {
  // A feature sold on a plan whose whole daily budget cannot pay for one call is
  // a feature that always refuses.
  const featureOfAction = {
    VISIBILITY_CHECK: FEATURES.AI_VISIBILITY,
    CONTENT_WRITE: FEATURES.CONTENT,
    OUTREACH_DRAFT: FEATURES.OUTREACH,
    LEAD_ANALYSE: FEATURES.LEADS,
    SOCIAL_SET: FEATURES.SOCIAL,
    LISTING_COPY: FEATURES.LISTINGS,
    COMPETITOR_ANALYSE: FEATURES.COMPETITORS,
    SEO_RECOMMEND: FEATURES.OPPORTUNITIES,
    PAGE_CLASSIFY: FEATURES.CRAWL,
  };
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    for (const [action, feature] of Object.entries(featureOfAction)) {
      if (!plan.features.includes(feature)) continue;
      assert.ok(
        ACTIONS[action].usd <= DAILY_USD_CAP[id],
        `${id} sells ${feature} but one ${action} costs $${ACTIONS[action].usd} against a $${DAILY_USD_CAP[id]} daily cap`
      );
    }
  }
});

test("one day at the cap can never burn a whole month's credit budget", () => {
  // The module's stated purpose for the daily cap: "the monthly allowance stops
  // sustained overuse; this stops a loop, a bug or a bad actor turning a month's
  // budget into an afternoon's". That only holds while the daily cap is strictly
  // below the month's total headroom.
  for (const id of PLAN_ORDER) {
    const monthlyHeadroom = PLANS[id].credits * CREDIT_USD;
    assert.ok(
      DAILY_USD_CAP[id] < monthlyHeadroom,
      `${id}: one day permits $${DAILY_USD_CAP[id]} against a whole month's $${monthlyHeadroom.toFixed(2)} — a runaway loop could spend the month in an afternoon`
    );
  }
});
