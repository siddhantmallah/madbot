// lib/plans.js — the single source of truth for pricing and limits.
//
// The things tested here are the ones that cost money when wrong: a region with
// no price silently bills the US number, an annual figure that is not ten
// monthly payments makes the "2 months free" badge a lie, and a highlight line
// with a stale number is a promise on the pricing page the product will not keep.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const {
  PLANS,
  PLAN_ORDER,
  REGIONS,
  DEFAULT_REGION,
  FEATURES,
  FEATURE_LABELS,
  ACTIVE_STATUSES,
  AUTONOMY_BANDS,
  autonomyLabel,
  cheapestPlanForAutonomy,
  cheapestPlanForSites,
  cheapestPlanWith,
  cheapestPlanWithCredits,
  featuresLostOnDowngrade,
  formatPrice,
  highlightsFor,
  minorUnits,
  planById,
  priceFor,
} = await import("../lib/plans.js");

const REGION_CODES = Object.keys(REGIONS);
const ORDERED = PLAN_ORDER.map((id) => PLANS[id]);
const PAID = ORDERED.filter((p) => p.price[DEFAULT_REGION] > 0);
const ALL_PLAN_IDS = Object.keys(PLANS);
const COUNTABLE = ["maxSites", "credits", "leadCredits", "emails", "contentPieces", "socialPosts", "maxAutonomy"];

// ---------------------------------------------------------------------------
// Region coverage
// ---------------------------------------------------------------------------

test("REGIONS covers exactly IN, US, EU, GB, AE, SG", () => {
  assert.deepEqual([...REGION_CODES].sort(), ["AE", "EU", "GB", "IN", "SG", "US"]);
});

test("every region has a currency, a symbol and a label", () => {
  for (const [code, r] of Object.entries(REGIONS)) {
    assert.ok(r.currency, `${code} has no currency`);
    assert.ok(r.symbol, `${code} has no symbol`);
    assert.ok(r.label, `${code} has no label`);
  }
});

for (const plan of ALL_PLAN_IDS.map((id) => PLANS[id])) {
  test(`${plan.id}: monthly price is stated for every region, not inherited from US`, () => {
    for (const region of REGION_CODES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(plan.price, region),
        `${plan.id} has no ${region} monthly price — priceFor() would silently bill the ${DEFAULT_REGION} number`
      );
      assert.equal(typeof plan.price[region], "number", `${plan.id}.price.${region} is not a number`);
      assert.ok(plan.price[region] >= 0, `${plan.id}.price.${region} is negative`);
    }
  });
}

for (const plan of PAID) {
  test(`${plan.id}: annual price is stated for every region, not inherited from US`, () => {
    assert.ok(plan.annual, `${plan.id} has no annual table at all`);
    for (const region of REGION_CODES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(plan.annual, region),
        `${plan.id} has no ${region} annual price — priceFor() would silently bill the ${DEFAULT_REGION} number`
      );
      assert.equal(typeof plan.annual[region], "number", `${plan.id}.annual.${region} is not a number`);
    }
  });
}

for (const plan of PAID) {
  test(`${plan.id}: annual is exactly ten months of monthly in every region`, () => {
    for (const region of REGION_CODES) {
      const monthly = plan.price[region];
      const annual = plan.annual?.[region];
      assert.equal(
        annual,
        monthly * 10,
        `${plan.id}/${region}: annual ${annual} is not 10 x monthly ${monthly} (${(annual / monthly).toFixed(2)} months) — the "2 months free" badge would be wrong`
      );
    }
  });
}

test('the pricing page\'s "annual / 12" figure is genuinely below the monthly price', () => {
  for (const plan of PAID) {
    for (const region of REGION_CODES) {
      const perMonth = Math.round(plan.annual[region] / 12);
      assert.ok(
        perMonth < plan.price[region],
        `${plan.id}/${region}: annual shown as ${perMonth}/mo but monthly is ${plan.price[region]}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// priceFor / formatPrice
// ---------------------------------------------------------------------------

test("priceFor returns the stated regional number, never a fallback, for every plan and cycle", () => {
  for (const plan of ORDERED) {
    for (const region of REGION_CODES) {
      assert.equal(priceFor(plan, region, "monthly"), plan.price[region], `${plan.id}/${region} monthly`);
      if (plan.annual) {
        assert.equal(priceFor(plan, region, "annual"), plan.annual[region], `${plan.id}/${region} annual`);
      }
    }
  }
});

test("priceFor falls back to the default region for an unknown region code", () => {
  assert.equal(priceFor(PLANS.growth, "ZZ"), PLANS.growth.price[DEFAULT_REGION]);
});

test("priceFor defaults to the default region and the monthly cycle", () => {
  assert.equal(priceFor(PLANS.growth), PLANS.growth.price[DEFAULT_REGION]);
});

test("the pricing page's annual toggle survives every plan it renders (formatPrice(priceFor(...)) never throws)", () => {
  // app/pricing/page.js renders PLAN_ORDER.map(id => PLANS[id]) and calls
  // formatPrice(priceFor(p, region, "annual"), region) for each. A plan with no
  // annual table makes priceFor return null, and formatPrice(null) throws.
  for (const plan of ORDERED) {
    for (const region of REGION_CODES) {
      const amount = priceFor(plan, region, "annual");
      const perMonth = amount ? Math.round(amount / 12) : amount;
      assert.doesNotThrow(
        () => formatPrice(perMonth, region),
        `formatPrice(priceFor(${plan.id}, ${region}, "annual")) threw — priceFor returned ${JSON.stringify(amount)}`
      );
    }
  }
});

test("formatPrice returns Free for zero in every region", () => {
  for (const region of REGION_CODES) {
    assert.equal(formatPrice(0, region), "Free", `${region}`);
  }
});

test("formatPrice renders each currency with its own symbol", () => {
  assert.equal(formatPrice(29, "US"), "$29");
  assert.equal(formatPrice(27, "EU"), "€27");
  assert.equal(formatPrice(24, "GB"), "£24");
  // AED's symbol carries a deliberate non-breaking space so the code and the
  // number cannot be split across a line.
  assert.equal(formatPrice(109, "AE"), "AED 109");
  assert.equal(formatPrice(39, "SG"), "S$39");
  assert.equal(formatPrice(1499, "IN"), "₹1,499");
});

test("formatPrice uses Indian digit grouping for INR", () => {
  assert.equal(formatPrice(149990, "IN"), "₹1,49,990");
  assert.equal(formatPrice(79990, "IN"), "₹79,990");
  assert.equal(formatPrice(14999, "IN"), "₹14,999");
});

test("formatPrice uses western grouping outside India", () => {
  assert.equal(formatPrice(149990, "US"), "$149,990");
  assert.equal(formatPrice(2990, "EU"), "€2,990");
});

test("formatPrice falls back to the default region for an unknown region", () => {
  assert.equal(formatPrice(29, "ZZ"), formatPrice(29, DEFAULT_REGION));
});

test("every real plan price renders without throwing, monthly and annual", () => {
  for (const plan of ORDERED) {
    for (const region of REGION_CODES) {
      assert.doesNotThrow(() => formatPrice(plan.price[region], region), `${plan.id}/${region} monthly`);
      if (plan.annual) {
        assert.doesNotThrow(() => formatPrice(plan.annual[region], region), `${plan.id}/${region} annual`);
      }
    }
  }
});

test("minorUnits converts to whole minor units", () => {
  assert.equal(minorUnits(29), 2900);
  assert.equal(minorUnits(0), 0);
  assert.equal(minorUnits(24.99), 2499);
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("PLAN_ORDER is ascending by monthly price in every region", () => {
  for (const region of REGION_CODES) {
    for (let i = 1; i < ORDERED.length; i += 1) {
      assert.ok(
        ORDERED[i].price[region] > ORDERED[i - 1].price[region],
        `${region}: ${ORDERED[i].id} (${ORDERED[i].price[region]}) is not above ${ORDERED[i - 1].id} (${ORDERED[i - 1].price[region]})`
      );
    }
  }
});

test("PLAN_ORDER is ascending by annual price in every region", () => {
  for (const region of REGION_CODES) {
    const paid = ORDERED.filter((p) => p.annual);
    for (let i = 1; i < paid.length; i += 1) {
      assert.ok(paid[i].annual[region] > paid[i - 1].annual[region], `${region}: ${paid[i].id} vs ${paid[i - 1].id}`);
    }
  }
});

test("PLAN_ORDER is ascending by every countable limit", () => {
  for (const field of ["maxSites", "credits", "leadCredits", "emails", "contentPieces", "maxAutonomy"]) {
    for (let i = 1; i < ORDERED.length; i += 1) {
      assert.ok(
        ORDERED[i][field] >= ORDERED[i - 1][field],
        `${field}: ${ORDERED[i].id} (${ORDERED[i][field]}) is below ${ORDERED[i - 1].id} (${ORDERED[i - 1][field]}) — a more expensive plan must never give less`
      );
    }
  }
});

test("PLAN_ORDER contains only purchasable plans, and every purchasable plan", () => {
  for (const id of PLAN_ORDER) assert.ok(PLANS[id].purchasable, `${id} is in PLAN_ORDER but not purchasable`);
  for (const [id, plan] of Object.entries(PLANS)) {
    if (plan.purchasable) assert.ok(PLAN_ORDER.includes(id), `${id} is purchasable but missing from PLAN_ORDER`);
  }
});

test("a more expensive plan never has fewer features", () => {
  for (let i = 1; i < ORDERED.length; i += 1) {
    const lost = featuresLostOnDowngrade(ORDERED[i - 1].id, ORDERED[i].id);
    assert.deepEqual(lost, [], `${ORDERED[i].id} is missing features that the cheaper ${ORDERED[i - 1].id} has`);
  }
});

// ---------------------------------------------------------------------------
// highlightsFor
// ---------------------------------------------------------------------------

for (const plan of Object.values(PLANS)) {
  test(`highlightsFor(${plan.id}) emits no duplicate line`, () => {
    const lines = highlightsFor(plan);
    const seen = new Set();
    for (const line of lines) {
      assert.ok(!seen.has(line), `duplicate highlight "${line}" for ${plan.id}`);
      seen.add(line);
    }
  });

  test(`highlightsFor(${plan.id}) emits no number that contradicts the plan object`, () => {
    const values = new Set(COUNTABLE.map((f) => plan[f]).filter((v) => typeof v === "number"));
    for (const line of highlightsFor(plan)) {
      const numbers = (line.match(/[\d,]*\d/g) || []).map((n) => Number(n.replace(/,/g, "")));
      for (const n of numbers) {
        assert.ok(
          values.has(n),
          `${plan.id}: highlight "${line}" states ${n}, which is not any of the plan's own limits (${[...values].join(", ")})`
        );
      }
    }
  });

  test(`highlightsFor(${plan.id}) states the real site count with correct pluralisation`, () => {
    const expected = `${plan.maxSites} ${plan.maxSites === 1 ? "website" : "websites"}`;
    assert.equal(highlightsFor(plan)[0], expected);
  });
}

test("highlightsFor never emits an empty or whitespace-only line", () => {
  for (const plan of Object.values(PLANS)) {
    for (const line of highlightsFor(plan)) {
      assert.ok(String(line).trim().length > 0, `${plan.id} emitted a blank highlight`);
    }
  }
});

// ---------------------------------------------------------------------------
// cheapest* helpers
// ---------------------------------------------------------------------------

test("cheapestPlanWith returns the genuinely cheapest purchasable plan holding each feature", () => {
  for (const feature of Object.values(FEATURES)) {
    const got = cheapestPlanWith(feature);
    const candidates = ORDERED.filter((p) => p.features.includes(feature));
    assert.ok(candidates.length > 0, `no purchasable plan has ${feature} at all`);
    const trueCheapest = candidates.reduce((a, b) => (b.price[DEFAULT_REGION] < a.price[DEFAULT_REGION] ? b : a));
    assert.equal(got?.id, trueCheapest.id, `cheapestPlanWith("${feature}") said ${got?.id}, cheapest is ${trueCheapest.id}`);
  }
});

test("cheapestPlanWith agrees with itself in every region, not just the default one", () => {
  for (const feature of Object.values(FEATURES)) {
    const got = cheapestPlanWith(feature);
    const candidates = ORDERED.filter((p) => p.features.includes(feature));
    for (const region of REGION_CODES) {
      const cheapest = candidates.reduce((a, b) => (b.price[region] < a.price[region] ? b : a));
      assert.equal(got?.id, cheapest.id, `${feature} in ${region}`);
    }
  }
});

test("cheapestPlanWith returns null for a feature nothing has", () => {
  assert.equal(cheapestPlanWith("teleportation"), null);
});

test("cheapestPlanForSites returns the cheapest plan that actually covers the count", () => {
  for (let n = 1; n <= 25; n += 1) {
    const got = cheapestPlanForSites(n);
    assert.ok(got, `no plan covers ${n} sites`);
    assert.ok(got.maxSites >= n, `cheapestPlanForSites(${n}) returned ${got.id} which only covers ${got.maxSites}`);
    const cheaper = ORDERED.filter((p) => p.maxSites >= n && p.price[DEFAULT_REGION] < got.price[DEFAULT_REGION]);
    assert.deepEqual(cheaper.map((p) => p.id), [], `cheapestPlanForSites(${n}) missed a cheaper plan`);
  }
});

test("cheapestPlanForSites returns null above the largest plan", () => {
  assert.equal(cheapestPlanForSites(26), null);
});

test("cheapestPlanForAutonomy returns the cheapest plan reaching each band ceiling", () => {
  for (const value of [0, 1, 24, 25, 47, 48, 79, 80, 100]) {
    const got = cheapestPlanForAutonomy(value);
    assert.ok(got, `no plan reaches autonomy ${value}`);
    assert.ok(got.maxAutonomy >= value, `cheapestPlanForAutonomy(${value}) returned ${got.id} capped at ${got.maxAutonomy}`);
    const cheaper = ORDERED.filter((p) => p.maxAutonomy >= value && p.price[DEFAULT_REGION] < got.price[DEFAULT_REGION]);
    assert.deepEqual(cheaper.map((p) => p.id), [], `cheapestPlanForAutonomy(${value}) missed a cheaper plan`);
  }
});

test("cheapestPlanForAutonomy returns null above 100", () => {
  assert.equal(cheapestPlanForAutonomy(101), null);
});

test("cheapestPlanWithCredits returns the cheapest plan with the allowance", () => {
  assert.equal(cheapestPlanWithCredits(1)?.id, "free");
  assert.equal(cheapestPlanWithCredits(31)?.id, "starter");
  assert.equal(cheapestPlanWithCredits(551)?.id, "growth");
  assert.equal(cheapestPlanWithCredits(999999), null);
});

// ---------------------------------------------------------------------------
// featuresLostOnDowngrade
// ---------------------------------------------------------------------------

test("featuresLostOnDowngrade names exactly what growth has and starter does not", () => {
  assert.deepEqual(featuresLostOnDowngrade("growth", "starter").sort(), ["content", "leads", "outreach", "social"]);
});

test("featuresLostOnDowngrade is empty for an upgrade and for the same plan", () => {
  assert.deepEqual(featuresLostOnDowngrade("starter", "growth"), []);
  assert.deepEqual(featuresLostOnDowngrade("growth", "growth"), []);
});

test("featuresLostOnDowngrade returns [] rather than throwing for unknown plan ids", () => {
  assert.deepEqual(featuresLostOnDowngrade("nonsense", "growth"), []);
  assert.deepEqual(featuresLostOnDowngrade("growth", "nonsense"), []);
});

test("every feature lost on a downgrade has a human label", () => {
  for (const from of PLAN_ORDER) {
    for (const to of PLAN_ORDER) {
      for (const f of featuresLostOnDowngrade(from, to)) {
        assert.ok(FEATURE_LABELS[f], `no FEATURE_LABELS entry for "${f}"`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Features / autonomy bands
// ---------------------------------------------------------------------------

test("every feature listed on a plan is a real FEATURES value", () => {
  const known = new Set(Object.values(FEATURES));
  for (const plan of Object.values(PLANS)) {
    for (const f of plan.features) assert.ok(known.has(f), `${plan.id} lists unknown feature "${f}"`);
  }
});

test("FEATURE_LABELS covers every feature", () => {
  for (const f of Object.values(FEATURES)) assert.ok(FEATURE_LABELS[f], `no label for ${f}`);
});

test("no plan lists the same feature twice", () => {
  for (const plan of Object.values(PLANS)) {
    assert.equal(new Set(plan.features).size, plan.features.length, `${plan.id} lists a feature twice`);
  }
});

test("AUTONOMY_BANDS ascend and top out at 100", () => {
  for (let i = 1; i < AUTONOMY_BANDS.length; i += 1) {
    assert.ok(AUTONOMY_BANDS[i].max > AUTONOMY_BANDS[i - 1].max, `band ${i} does not ascend`);
  }
  assert.equal(AUTONOMY_BANDS[AUTONOMY_BANDS.length - 1].max, 100);
});

test("every plan's maxAutonomy is exactly a band ceiling", () => {
  const ceilings = AUTONOMY_BANDS.map((b) => b.max);
  for (const plan of Object.values(PLANS)) {
    assert.ok(
      ceilings.includes(plan.maxAutonomy),
      `${plan.id}.maxAutonomy is ${plan.maxAutonomy}, which is not a band ceiling (${ceilings.join(", ")}) — the dial would show a label the plan does not actually reach`
    );
  }
});

test("autonomyLabel returns the right band at every ceiling and just inside it", () => {
  assert.equal(autonomyLabel(0), "Watch only");
  assert.equal(autonomyLabel(24), "Watch only");
  assert.equal(autonomyLabel(25), "Suggest");
  assert.equal(autonomyLabel(47), "Suggest");
  assert.equal(autonomyLabel(48), "Let it rip");
  assert.equal(autonomyLabel(79), "Let it rip");
  assert.equal(autonomyLabel(80), "Full send");
  assert.equal(autonomyLabel(100), "Full send");
});

test("autonomyLabel does not throw or return undefined outside 0-100", () => {
  assert.equal(autonomyLabel(-5), "Watch only");
  assert.equal(autonomyLabel(101), "Full send");
  assert.ok(autonomyLabel(NaN));
});

// ---------------------------------------------------------------------------
// Misc invariants
// ---------------------------------------------------------------------------

test("planById falls back to lapsed for an unknown id", () => {
  assert.equal(planById("nonsense").id, "lapsed");
  assert.equal(planById(undefined).id, "lapsed");
  assert.equal(planById("growth").id, "growth");
});

test("lapsed is not purchasable and entitles nothing countable", () => {
  assert.equal(PLANS.lapsed.purchasable, false);
  assert.equal(PLANS.lapsed.credits, 0);
  assert.equal(PLANS.lapsed.leadCredits, 0);
  assert.equal(PLANS.lapsed.emails, 0);
});

test("ACTIVE_STATUSES keeps past_due entitled and excludes cancellation", () => {
  assert.ok(ACTIVE_STATUSES.includes("past_due"));
  assert.ok(ACTIVE_STATUSES.includes("active"));
  assert.ok(ACTIVE_STATUSES.includes("trialing"));
  assert.ok(!ACTIVE_STATUSES.includes("canceled"));
  assert.ok(!ACTIVE_STATUSES.includes("cancelled"));
  assert.ok(!ACTIVE_STATUSES.includes("incomplete_expired"));
});

test("every plan carries the copy the pricing page needs", () => {
  for (const plan of Object.values(PLANS)) {
    assert.equal(typeof plan.name, "string");
    assert.ok(plan.name.length > 0, `${plan.id} has no name`);
    assert.ok(plan.tagline, `${plan.id} has no tagline`);
    assert.ok(plan.blurb, `${plan.id} has no blurb`);
    assert.ok(Array.isArray(plan.highlights), `${plan.id}.highlights is not an array`);
  }
});

test("exactly one plan is featured", () => {
  const featured = Object.values(PLANS).filter((p) => p.featured);
  assert.equal(featured.length, 1, `featured plans: ${featured.map((p) => p.id).join(", ")}`);
});

test("a plan that sells social posting has a nonzero social allowance, and vice versa", () => {
  for (const plan of Object.values(PLANS)) {
    const sellsSocial = plan.features.includes(FEATURES.SOCIAL);
    if (sellsSocial) {
      assert.ok(plan.socialPosts > 0, `${plan.id} includes the social feature but allows ${plan.socialPosts} posts`);
    } else {
      assert.equal(plan.socialPosts, 0, `${plan.id} allows ${plan.socialPosts} social posts without the social feature`);
    }
  }
});

test("a plan that sells content publishing has a nonzero content allowance", () => {
  for (const plan of Object.values(PLANS)) {
    if (plan.features.includes(FEATURES.CONTENT)) {
      assert.ok(plan.contentPieces > 0, `${plan.id} includes content but allows ${plan.contentPieces} pieces`);
    }
  }
});

test("a plan that sells outreach has a nonzero email allowance", () => {
  for (const plan of Object.values(PLANS)) {
    if (plan.features.includes(FEATURES.OUTREACH)) {
      assert.ok(plan.emails > 0, `${plan.id} includes outreach but allows ${plan.emails} emails`);
    }
  }
});
