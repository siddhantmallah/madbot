// lib/entitlements.js — what a stored subscription is actually allowed to do.
//
// The expensive failure mode here is fail-open: a subscription that should have
// lapsed but still resolves to a paid plan hands out model spend for free. The
// currentPeriodEnd tests below are the ones that stop a missed webhook doing
// that, and they are run against all three timestamp shapes that reach this
// code (a Date, an ISO string, and a Firestore Timestamp).

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const { PLANS, PLAN_ORDER, FEATURES, AUTONOMY_BANDS } = await import("../lib/plans.js");
const { activePlan, featureAccess, siteAccess, autonomyAccess, clampAutonomy, usageSummary } = await import(
  "../lib/entitlements.js"
);

const DAY = 86400000;
const past = Date.now() - 3 * DAY;
const future = Date.now() + 30 * DAY;

// The three shapes a currentPeriodEnd arrives in: written by the client as a
// Date, serialised over the wire as an ISO string, read back from Firestore as
// a Timestamp.
const shapes = {
  Date: (ms) => new Date(ms),
  "ISO string": (ms) => new Date(ms).toISOString(),
  "Firestore Timestamp": (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) }),
};

// ---------------------------------------------------------------------------
// activePlan
// ---------------------------------------------------------------------------

test("no subscription at all yields the free plan, not the lapsed one", () => {
  assert.equal(activePlan(undefined).id, "free");
  assert.equal(activePlan(null).id, "free");
  assert.equal(activePlan({}).id, "free");
  assert.equal(activePlan({ status: "active" }).id, "free", "a status with no plan is still nobody who ever signed up");
});

test("a cancelled subscription yields lapsed", () => {
  assert.equal(activePlan({ plan: "growth", status: "canceled", currentPeriodEnd: future }).id, "lapsed");
  assert.equal(activePlan({ plan: "growth", status: "cancelled", currentPeriodEnd: future }).id, "lapsed");
});

test("an unpaid, incomplete or unknown status yields lapsed", () => {
  for (const status of ["unpaid", "incomplete", "incomplete_expired", "paused", "", undefined, null, "ACTIVE"]) {
    assert.equal(
      activePlan({ plan: "pro", status, currentPeriodEnd: future }).id,
      "lapsed",
      `status ${JSON.stringify(status)} should not entitle`
    );
  }
});

test("an active subscription inside its period yields the plan that was bought", () => {
  for (const id of PLAN_ORDER) {
    assert.equal(activePlan({ plan: id, status: "active", currentPeriodEnd: future }).id, id);
  }
});

test("past_due still entitles — a failed card retry does not cut service", () => {
  assert.equal(activePlan({ plan: "growth", status: "past_due", currentPeriodEnd: future }).id, "growth");
});

test("trialing entitles the trial plan", () => {
  assert.equal(activePlan({ plan: "growth", status: "trialing", currentPeriodEnd: future }).id, "growth");
});

for (const [label, make] of Object.entries(shapes)) {
  test(`a period that ended in the past yields lapsed however "active" it claims to be — ${label}`, () => {
    assert.equal(
      activePlan({ plan: "growth", status: "active", currentPeriodEnd: make(past) }).id,
      "lapsed",
      `${label}: an expired period must not entitle — this is what stops a missed webhook giving away free service`
    );
  });

  test(`a past period beats past_due too — ${label}`, () => {
    assert.equal(activePlan({ plan: "pro", status: "past_due", currentPeriodEnd: make(past) }).id, "lapsed");
  });

  test(`a past period ends a trial — ${label}`, () => {
    assert.equal(activePlan({ plan: "growth", status: "trialing", currentPeriodEnd: make(past) }).id, "lapsed");
  });

  test(`a future period still entitles — ${label}`, () => {
    assert.equal(activePlan({ plan: "growth", status: "active", currentPeriodEnd: make(future) }).id, "growth");
  });
}

test("LATENT GAP: a numeric epoch currentPeriodEnd is silently ignored rather than honoured", () => {
  // toMillis() handles Date, Firestore Timestamp and ISO string. A number falls
  // through to Date.parse(number) -> NaN -> 0, which reads as "no period end",
  // so the expiry check never fires at all.
  //
  // Nothing in the repo writes a numeric currentPeriodEnd today (every writer in
  // lib/billingAdmin.js and app/api/billing/start-trial uses a Date), so this is
  // a hardening gap rather than a live defect. It becomes a live defect the day a
  // payment-provider webhook is wired up, because Stripe and Razorpay both send
  // current_period_end as a unix integer.
  assert.equal(
    activePlan({ plan: "growth", status: "active", currentPeriodEnd: past }).id,
    "lapsed",
    "a numeric epoch currentPeriodEnd in the past must still lapse"
  );
});

test("an absent currentPeriodEnd does not lapse an otherwise active subscription", () => {
  assert.equal(activePlan({ plan: "growth", status: "active" }).id, "growth");
  assert.equal(activePlan({ plan: "growth", status: "active", currentPeriodEnd: null }).id, "growth");
});

test("an unparseable currentPeriodEnd does not lapse an active subscription", () => {
  assert.equal(activePlan({ plan: "growth", status: "active", currentPeriodEnd: "not a date" }).id, "growth");
});

test("an unknown plan id on an active subscription yields lapsed, not a crash", () => {
  assert.equal(activePlan({ plan: "enterprise_platinum", status: "active" }).id, "lapsed");
});

// ---------------------------------------------------------------------------
// featureAccess
// ---------------------------------------------------------------------------

test("featureAccess allows what the plan includes", () => {
  const sub = { plan: "growth", status: "active", currentPeriodEnd: future };
  for (const f of PLANS.growth.features) {
    assert.equal(featureAccess(sub, f).allowed, true, `growth should allow ${f}`);
  }
});

test("featureAccess denies what the plan excludes and names a plan that really has it", () => {
  for (const planId of PLAN_ORDER) {
    const sub = { plan: planId, status: "active", currentPeriodEnd: future };
    for (const f of Object.values(FEATURES)) {
      const res = featureAccess(sub, f);
      if (PLANS[planId].features.includes(f)) continue;
      assert.equal(res.allowed, false, `${planId} should not allow ${f}`);
      assert.ok(res.upgradeTo, `${planId}/${f}: denial offers no upgrade`);
      assert.ok(
        PLANS[res.upgradeTo]?.features.includes(f),
        `${planId}/${f}: denial points at ${res.upgradeTo}, which does not include ${f}`
      );
      assert.ok(
        PLANS[res.upgradeTo].price.US > PLANS[planId].price.US,
        `${planId}/${f}: denial points at ${res.upgradeTo}, which is not an upgrade`
      );
      assert.ok(res.reason && res.reason.includes(PLANS[res.upgradeTo].name), `${planId}/${f}: reason omits the plan name`);
    }
  }
});

test("featureAccess denial for an unknown feature does not invent an upgrade", () => {
  const res = featureAccess({ plan: "growth", status: "active" }, "teleportation");
  assert.equal(res.allowed, false);
  assert.equal(res.upgradeTo, null);
  assert.ok(res.reason);
});

test("a lapsed subscription still reads the core features (deliberate) but nothing paid", () => {
  const sub = { plan: "pro", status: "canceled" };
  assert.equal(featureAccess(sub, FEATURES.AUDIT).allowed, true);
  assert.equal(featureAccess(sub, FEATURES.SOCIAL).allowed, false);
  assert.equal(featureAccess(sub, FEATURES.CONTENT).allowed, false);
});

test("an expired period revokes a paid feature immediately", () => {
  const sub = { plan: "pro", status: "active", currentPeriodEnd: new Date(past) };
  assert.equal(featureAccess(sub, FEATURES.SOCIAL).allowed, false, "an expired pro must not keep social posting");
  assert.equal(featureAccess(sub, FEATURES.LEADS).allowed, false);
});

// ---------------------------------------------------------------------------
// siteAccess
// ---------------------------------------------------------------------------

test("siteAccess allows up to the plan's limit and refuses beyond it", () => {
  const sub = { plan: "growth", status: "active", currentPeriodEnd: future };
  assert.equal(siteAccess(sub, 0).allowed, true);
  assert.equal(siteAccess(sub, 2).allowed, true, "the third site must be addable on a 3-site plan");
  assert.equal(siteAccess(sub, 3).allowed, false, "a fourth site must not be addable on a 3-site plan");
});

test("siteAccess denial names a plan that genuinely covers one more site", () => {
  for (const planId of PLAN_ORDER) {
    const plan = PLANS[planId];
    const res = siteAccess({ plan: planId, status: "active", currentPeriodEnd: future }, plan.maxSites);
    assert.equal(res.allowed, false);
    if (res.upgradeTo) {
      assert.ok(
        PLANS[res.upgradeTo].maxSites > plan.maxSites,
        `${planId}: denial points at ${res.upgradeTo} which covers ${PLANS[res.upgradeTo].maxSites}`
      );
    }
  }
});

test("siteAccess above the largest plan says talk to us rather than offering nothing", () => {
  const res = siteAccess({ plan: "agency", status: "active", currentPeriodEnd: future }, 25);
  assert.equal(res.allowed, false);
  assert.equal(res.upgradeTo, null);
  assert.ok(/talk to us/i.test(res.reason), `reason was: ${res.reason}`);
});

test("siteAccess pluralises the site count correctly", () => {
  const one = siteAccess({ plan: "starter", status: "active", currentPeriodEnd: future }, 1);
  assert.ok(/covers 1 site\./.test(one.reason), `reason was: ${one.reason}`);
  const many = siteAccess({ plan: "growth", status: "active", currentPeriodEnd: future }, 3);
  assert.ok(/covers 3 sites\./.test(many.reason), `reason was: ${many.reason}`);
});

// ---------------------------------------------------------------------------
// autonomyAccess
// ---------------------------------------------------------------------------

test("autonomyAccess permits exactly up to the plan cap", () => {
  for (const planId of PLAN_ORDER) {
    const plan = PLANS[planId];
    const sub = { plan: planId, status: "active", currentPeriodEnd: future };
    assert.equal(autonomyAccess(sub, plan.maxAutonomy).allowed, true, `${planId} at its own cap`);
    if (plan.maxAutonomy < 100) {
      assert.equal(autonomyAccess(sub, plan.maxAutonomy + 1).allowed, false, `${planId} one above its cap`);
    }
  }
});

test("autonomyAccess denial names a plan that genuinely reaches further", () => {
  for (const planId of PLAN_ORDER) {
    const plan = PLANS[planId];
    if (plan.maxAutonomy >= 100) continue;
    const res = autonomyAccess({ plan: planId, status: "active", currentPeriodEnd: future }, plan.maxAutonomy + 1);
    assert.ok(res.upgradeTo, `${planId} offers no upgrade`);
    assert.ok(
      PLANS[res.upgradeTo].maxAutonomy > plan.maxAutonomy,
      `${planId}: points at ${res.upgradeTo} capped at ${PLANS[res.upgradeTo].maxAutonomy}`
    );
  }
});

// ---------------------------------------------------------------------------
// clampAutonomy
// ---------------------------------------------------------------------------

test("clampAutonomy never returns above the plan cap", () => {
  for (const planId of [...PLAN_ORDER, "lapsed"]) {
    const sub = { plan: planId, status: "active", currentPeriodEnd: future };
    for (const v of [0, 1, 50, 99, 100, 101, 1000, Number.MAX_SAFE_INTEGER, "250"]) {
      const got = clampAutonomy(sub, v);
      assert.ok(got <= PLANS[planId].maxAutonomy, `${planId} clamp(${v}) = ${got} > cap ${PLANS[planId].maxAutonomy}`);
    }
  }
});

test("clampAutonomy never returns below zero", () => {
  const sub = { plan: "pro", status: "active", currentPeriodEnd: future };
  for (const v of [-1, -100, "-40", -0.5, Number.MIN_SAFE_INTEGER]) {
    assert.ok(clampAutonomy(sub, v) >= 0, `clamp(${v}) = ${clampAutonomy(sub, v)}`);
  }
});

test("clampAutonomy accepts numeric strings", () => {
  const sub = { plan: "pro", status: "active", currentPeriodEnd: future };
  assert.equal(clampAutonomy(sub, "63"), 63);
  assert.equal(clampAutonomy(sub, "0"), 0);
});

test("clampAutonomy on a lapsed subscription drops to the lapsed cap", () => {
  assert.equal(clampAutonomy({ plan: "pro", status: "canceled" }, 100), PLANS.lapsed.maxAutonomy);
});

test("clampAutonomy fails SAFE for a missing or unreadable stored value", () => {
  // A stored autonomy value that is absent or corrupt must not be read as "run
  // everything". Full send means MADBOT spends the customer's money unattended.
  const sub = { plan: "pro", status: "active", currentPeriodEnd: future };
  const safeCeiling = AUTONOMY_BANDS[0].max; // "Watch only"
  for (const v of [undefined, NaN, "abc", {}, Infinity, -Infinity]) {
    const got = clampAutonomy(sub, v);
    assert.ok(
      got <= safeCeiling,
      `clampAutonomy(pro, ${String(v)}) returned ${got} — a non-finite stored value is being read as maximum autonomy, not as the safe minimum`
    );
  }
});

test("clampAutonomy treats null and empty string as zero", () => {
  const sub = { plan: "pro", status: "active", currentPeriodEnd: future };
  assert.equal(clampAutonomy(sub, null), 0);
  assert.equal(clampAutonomy(sub, ""), 0);
});

// ---------------------------------------------------------------------------
// usageSummary
// ---------------------------------------------------------------------------

test("usageSummary on no subscription reports the free plan and no status", () => {
  const s = usageSummary(undefined);
  assert.equal(s.plan.id, "free");
  assert.equal(s.status, "none");
  assert.equal(s.trialing, false);
  assert.equal(s.trialDaysLeft, null);
  assert.equal(s.trialExpired, false);
});

test("usageSummary counts sites left and flags being over the limit", () => {
  const sub = { plan: "growth", status: "active", currentPeriodEnd: future };
  assert.deepEqual(
    { left: usageSummary(sub, { siteCount: 1 }).sitesLeft, over: usageSummary(sub, { siteCount: 1 }).overSiteLimit },
    { left: 2, over: false }
  );
  assert.deepEqual(
    { left: usageSummary(sub, { siteCount: 5 }).sitesLeft, over: usageSummary(sub, { siteCount: 5 }).overSiteLimit },
    { left: 0, over: true }
  );
});

test("usageSummary never reports negative sites left", () => {
  const sub = { plan: "starter", status: "active", currentPeriodEnd: future };
  assert.equal(usageSummary(sub, { siteCount: 40 }).sitesLeft, 0);
});

test("usageSummary reports a live trial with days remaining", () => {
  const s = usageSummary({ plan: "growth", status: "trialing", trialEndsAt: new Date(Date.now() + 5 * DAY) });
  assert.equal(s.trialing, true);
  assert.equal(s.trialDaysLeft, 5);
  assert.equal(s.trialExpired, false);
});

test("an expired trial stops announcing itself as a trial and is flagged expired", () => {
  const s = usageSummary({
    plan: "growth",
    status: "trialing",
    trialEndsAt: new Date(past),
    currentPeriodEnd: new Date(past),
  });
  assert.equal(s.plan.id, "lapsed");
  assert.equal(s.trialing, false, "an expired trial must not still read as trialing");
  assert.equal(s.trialExpired, true);
});

test("usageSummary never reports negative trial days", () => {
  const s = usageSummary({ plan: "growth", status: "trialing", trialEndsAt: new Date(past), currentPeriodEnd: future });
  assert.ok(s.trialDaysLeft === null || s.trialDaysLeft >= 0, `trialDaysLeft was ${s.trialDaysLeft}`);
});

test("usageSummary surfaces the plan the customer originally chose", () => {
  const s = usageSummary({ plan: "growth", status: "trialing", intendedPlan: "pro", currentPeriodEnd: future });
  assert.equal(s.intendedPlan?.id, "pro");
  assert.equal(usageSummary({ plan: "growth", status: "active", intendedPlan: "nonsense" }).intendedPlan, null);
});

test("usageSummary flags a manually granted licence and a pending cancellation", () => {
  const s = usageSummary({ plan: "pro", status: "active", provider: "manual", cancelAtPeriodEnd: true, currentPeriodEnd: future });
  assert.equal(s.grantedManually, true);
  assert.equal(s.cancelAtPeriodEnd, true);
  assert.equal(usageSummary({ plan: "pro", status: "active" }).grantedManually, false);
});

test("usageSummary maxSites always matches the resolved plan", () => {
  for (const planId of [...PLAN_ORDER, "lapsed"]) {
    const s = usageSummary({ plan: planId, status: "active", currentPeriodEnd: future });
    assert.equal(s.maxSites, s.plan.maxSites, planId);
  }
});
