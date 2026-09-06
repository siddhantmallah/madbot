// lib/credits.js — the credit ladder and the top-up prices.
//
// The module's own header states the invariant this file exists to check:
// "Every credit value below is derived from a measured or estimated USD cost
// divided by this number, so the ladder holds its margin instead of drifting."
// If a credit charge buys less variable-cost headroom than the action actually
// costs, MADBOT loses money on every use of that action — silently, and at
// exactly the rate the customer uses the feature as intended.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const { PLANS, PLAN_ORDER, REGIONS, FEATURES } = await import("../lib/plans.js");
const { ACTIONS, CREDIT_USD, TOPUPS, LEAD_CREDIT_PER_VERIFIED_LEAD, actionLabel, creditsFor, describeUsage } =
  await import("../lib/credits.js");

const REGION_CODES = Object.keys(REGIONS);

// ---------------------------------------------------------------------------
// Top-ups
// ---------------------------------------------------------------------------

for (const [id, topup] of Object.entries(TOPUPS)) {
  test(`TOPUPS.${id} has a stated price in all six regions`, () => {
    for (const region of REGION_CODES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(topup.price, region),
        `${id} has no ${region} price — the checkout would charge whatever the region resolver returns for a missing key`
      );
      assert.equal(typeof topup.price[region], "number", `${id}.price.${region} is not a number`);
      assert.ok(topup.price[region] > 0, `${id}.price.${region} is ${topup.price[region]} — a top-up must not be free`);
    }
  });

  test(`TOPUPS.${id} has a label and grants exactly one kind of allowance`, () => {
    assert.ok(topup.label, `${id} has no label`);
    const granted = ["credits", "leadCredits", "emails", "sites"].filter((k) => typeof topup[k] === "number");
    assert.equal(granted.length, 1, `${id} grants ${granted.length} allowance kinds (${granted.join(", ")})`);
    assert.ok(topup[granted[0]] > 0, `${id} grants ${topup[granted[0]]} of ${granted[0]}`);
  });

  test(`TOPUPS.${id} label agrees with the quantity it actually grants`, () => {
    const key = ["credits", "leadCredits", "emails", "sites"].find((k) => typeof topup[k] === "number");
    const stated = Number((topup.label.match(/[\d,]*\d/) || ["0"])[0].replace(/,/g, ""));
    assert.equal(stated, topup[key], `${id} is labelled "${topup.label}" but grants ${topup[key]}`);
  });
}

test("the region ordering of top-up prices matches the region ordering of plan prices", () => {
  // If GB is cheaper than EU for a plan, it must be cheaper for a top-up too;
  // otherwise regional pricing contradicts itself at checkout.
  const ref = PLANS.growth.price;
  for (const [id, topup] of Object.entries(TOPUPS)) {
    for (const a of REGION_CODES) {
      for (const b of REGION_CODES) {
        if (ref[a] === ref[b] || REGIONS[a].currency !== REGIONS[b].currency) continue;
        if (ref[a] < ref[b]) {
          assert.ok(topup.price[a] <= topup.price[b], `${id}: ${a} costs more than ${b}, but the plan is the other way round`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The credit cost table
// ---------------------------------------------------------------------------

test("every action has a positive whole-number credit charge, a cost and a label", () => {
  for (const [key, spec] of Object.entries(ACTIONS)) {
    assert.equal(typeof spec.credits, "number", `${key}.credits`);
    assert.ok(Number.isInteger(spec.credits), `${key}.credits is ${spec.credits}, not a whole number`);
    assert.ok(spec.credits >= 1, `${key} charges ${spec.credits} credits — every action must cost at least one`);
    assert.equal(typeof spec.usd, "number", `${key}.usd`);
    assert.ok(spec.usd >= 0, `${key}.usd is negative`);
    assert.ok(spec.label, `${key} has no label`);
  }
});

test("the credit charge for every action covers its own variable cost", () => {
  // CREDIT_USD is documented as the variable cost one credit is allowed to buy.
  // credits * CREDIT_USD must therefore be >= the action's measured usd cost.
  const shortfalls = [];
  for (const [key, spec] of Object.entries(ACTIONS)) {
    const budget = spec.credits * CREDIT_USD;
    if (budget < spec.usd - 1e-12) {
      shortfalls.push(
        `${key}: charges ${spec.credits} credit(s) = $${budget.toFixed(4)} of headroom but costs $${spec.usd.toFixed(4)} ` +
          `(${(((spec.usd - budget) / budget) * 100).toFixed(0)}% over; needs ${Math.ceil(spec.usd / CREDIT_USD)} credits)`
      );
    }
  }
  assert.deepEqual(
    shortfalls,
    [],
    `the ladder is not holding its margin — Math.round() in at()' rounds these down:\n  ${shortfalls.join("\n  ")}`
  );
});

test("no action charges more than one credit above its own cost (the ladder is not over-charging either)", () => {
  for (const [key, spec] of Object.entries(ACTIONS)) {
    const budget = spec.credits * CREDIT_USD;
    assert.ok(
      budget - spec.usd < CREDIT_USD || spec.credits === 1,
      `${key}: charges ${spec.credits} credits = $${budget.toFixed(4)} against a $${spec.usd.toFixed(4)} cost`
    );
  }
});

test("creditsFor returns the table value and throws loudly for an unknown action", () => {
  assert.equal(creditsFor("CONTENT_WRITE"), ACTIONS.CONTENT_WRITE.credits);
  assert.throws(() => creditsFor("MAKE_TEA"), /Unknown action/);
  assert.throws(() => creditsFor(undefined), /Unknown action/);
});

test("actionLabel falls back to the key rather than returning undefined", () => {
  assert.equal(actionLabel("CONTENT_WRITE"), ACTIONS.CONTENT_WRITE.label);
  assert.equal(actionLabel("MAKE_TEA"), "MAKE_TEA");
});

test("the most expensive action is affordable inside the cheapest plan that sells it", () => {
  // A plan that includes AI visibility but whose whole monthly allowance cannot
  // pay for a single check would be selling something that can never run.
  const check = ACTIONS.VISIBILITY_CHECK;
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (!plan.features.includes(FEATURES.AI_VISIBILITY)) continue;
    assert.ok(
      plan.credits >= check.credits,
      `${id} sells AI visibility but its ${plan.credits}-credit allowance cannot pay for one ${check.credits}-credit check`
    );
  }
});

test("a plan's whole credit allowance cannot exceed the revenue it is priced at", () => {
  // A sanity floor on the margin: total variable-cost headroom must stay under
  // the US monthly price. This is the arithmetic the module header warns about.
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (plan.price.US === 0) continue;
    const headroom = plan.credits * CREDIT_USD;
    assert.ok(
      headroom < plan.price.US,
      `${id}: ${plan.credits} credits authorise $${headroom.toFixed(2)} of spend against $${plan.price.US} of revenue`
    );
  }
});

test("LEAD_CREDIT_PER_VERIFIED_LEAD is one, so lead credits read as lead counts", () => {
  assert.equal(LEAD_CREDIT_PER_VERIFIED_LEAD, 1);
});

// ---------------------------------------------------------------------------
// describeUsage
// ---------------------------------------------------------------------------

test("describeUsage with a zero allowance says so rather than dividing by zero", () => {
  const r = describeUsage({ used: 0, allowance: 0 });
  assert.equal(r.pct, 0);
  assert.equal(r.exhausted, true);
  assert.ok(r.text && !/NaN|Infinity|undefined/.test(r.text), `text was "${r.text}"`);
});

test("describeUsage with a zero allowance and prior usage still says so", () => {
  const r = describeUsage({ used: 40, allowance: 0 });
  assert.equal(r.pct, 0);
  assert.equal(r.exhausted, true);
  assert.ok(!/NaN/.test(r.text), `text was "${r.text}"`);
});

test("describeUsage at exactly the allowance reads 100% and exhausted, but not nearly out", () => {
  const r = describeUsage({ used: 1450, allowance: 1450 });
  assert.equal(r.pct, 100);
  assert.equal(r.exhausted, true);
  assert.equal(r.nearlyOut, false, "a customer who is out should be told they are out, not warned they are nearly out");
  assert.equal(r.text, "1,450 of 1,450");
});

test("describeUsage above the allowance never reports over 100%", () => {
  for (const used of [1451, 3000, 1000000]) {
    const r = describeUsage({ used, allowance: 1450 });
    assert.ok(r.pct <= 100, `used ${used}: pct was ${r.pct}`);
    assert.equal(r.exhausted, true);
    assert.equal(r.nearlyOut, false);
  }
});

test("describeUsage one below the allowance is exhausted-false", () => {
  const r = describeUsage({ used: 1449, allowance: 1450 });
  assert.equal(r.exhausted, false);
  assert.equal(r.pct, 100, "rounding puts 99.93% at 100, which is honest enough for a bar");
  assert.equal(r.nearlyOut, true);
});

test("describeUsage crosses into nearlyOut exactly at 85%", () => {
  assert.equal(describeUsage({ used: 84, allowance: 100 }).nearlyOut, false);
  assert.equal(describeUsage({ used: 85, allowance: 100 }).nearlyOut, true);
  assert.equal(describeUsage({ used: 99, allowance: 100 }).nearlyOut, true);
  assert.equal(describeUsage({ used: 100, allowance: 100 }).nearlyOut, false);
});

test("describeUsage renders thousands separators and never a nonsense percentage", () => {
  for (const [used, allowance] of [[0, 30], [1, 1], [7, 550], [1140, 1450], [15000, 15000]]) {
    const r = describeUsage({ used, allowance });
    assert.ok(Number.isFinite(r.pct) && r.pct >= 0 && r.pct <= 100, `${used}/${allowance}: pct ${r.pct}`);
    assert.ok(!/NaN|Infinity|undefined|null/.test(r.text), `${used}/${allowance}: text "${r.text}"`);
  }
  assert.equal(describeUsage({ used: 1140, allowance: 1450 }).text, "1,140 of 1,450");
});

test("describeUsage does not throw when a usage counter is missing from the record", () => {
  // A Firestore usage document written before a counter existed has no field for
  // it, so `used` arrives as undefined.
  assert.doesNotThrow(() => describeUsage({ allowance: 1450 }), "missing `used` throws");
  const r = describeUsage({ allowance: 1450 });
  assert.ok(Number.isFinite(r.pct), `pct was ${r.pct}`);
  assert.ok(!/NaN|undefined/.test(r.text), `text was "${r.text}"`);
});

test("describeUsage does not throw when called with nothing at all", () => {
  assert.doesNotThrow(() => describeUsage({}));
});
