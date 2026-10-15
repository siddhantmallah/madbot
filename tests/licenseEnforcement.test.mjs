// Licence enforcement: what a plan lets an account spend, and on which sites.
//   node --no-warnings --import ./tests/_register.mjs tests/licenseEnforcement.test.mjs
//
// checkAllowance() is the decision reserve() makes inside its transaction, so
// these run without a database. Allowances are the account's, shared across
// every site the plan covers (decided 2026-10-14), so no site, whether new,
// deleted or made up, comes with an allowance of its own.
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const { checkAllowance, DAILY_USD_CAP } = await import("../lib/costControl.js");
const { sitesInsidePlan, SITE_ID, millisOf } = await import("../lib/siteLimits.js");
const { PLANS } = await import("../lib/plans.js");

const zero = { credits: 0, leadCredits: 0, emails: 0, contentPieces: 0, socialPosts: 0, costUsd: 0 };
const used = (over) => ({ ...zero, ...over });
const want = (over) => ({ credits: 1, leadCredits: 0, emails: 0, contentPieces: 0, socialPosts: 0, estimate: 0.01, ...over });
const check = (plan, { account = zero, accountToday = zero, w = want() } = {}) =>
  checkAllowance({ plan, account, accountToday, want: w });

suite("checkAllowance — the account-wide meter");

await test("an unused account on a paid plan may act", () => {
  eq(check(PLANS.growth).ok, true, "ok");
});

await test("an account at its monthly allowance is refused", () => {
  const r = check(PLANS.growth, { account: used({ credits: PLANS.growth.credits }) });
  eq(r.ok, false, "ok");
  eq(r.code, "credits_exhausted", "code");
  eq(r.allowance, PLANS.growth.credits, "the allowance is the plan's, not the plan's times its sites");
});

await test("a multi-site plan shares one allowance: Growth's 1,450 is the total, not per site", () => {
  // The old per-site meter allowed 3 × 1,450. Nothing about which site asks
  // changes the answer now; the site isn't even an input.
  const r = check(PLANS.growth, { account: used({ credits: PLANS.growth.credits - 1 }), w: want({ credits: 2 }) });
  eq(r.code, "credits_exhausted", "code");
});

await test("every metered dimension is measured against the account", () => {
  const p = PLANS.growth;
  for (const [key, code] of [
    ["leadCredits", "leads_exhausted"],
    ["contentPieces", "content_exhausted"],
    ["socialPosts", "social_exhausted"],
  ]) {
    const r = check(p, { account: used({ [key]: p[key] }), w: want({ [key]: 1 }) });
    eq(r.code, code, `${key} code`);
  }
});

await test("the daily cap applies to the account", () => {
  const cap = DAILY_USD_CAP.growth;
  eq(check(PLANS.growth, { accountToday: used({ costUsd: cap }) }).code, "daily_cap", "at cap");
  eq(check(PLANS.growth, { accountToday: used({ costUsd: cap - 1 }) }).ok, true, "under cap");
});

await test("a lapsed account spends nothing", () => {
  eq(check(PLANS.lapsed).ok, false, "ok");
});

await test("lead credits are checked against the plan's lead allowance", () => {
  const r = check(PLANS.growth, { account: used({ leadCredits: PLANS.growth.leadCredits - 2 }), w: want({ leadCredits: 3 }) });
  eq(r.code, "leads_exhausted", "code");
});

await test("a plan without social posting says so rather than reporting zero left", () => {
  const r = check(PLANS.starter, { w: want({ socialPosts: 1 }) });
  eq(r.code, "social_exhausted", "code");
  truthy(/doesn't include social/.test(r.reason), "reason names the plan gap");
});

suite("sitesInsidePlan — which sites a plan covers");

const site = (id, createdAt) => ({ id, createdAt });

await test("the oldest maxSites are covered", () => {
  const sites = [site("c", "2026-03-01"), site("a", "2026-01-01"), site("b", "2026-02-01"), site("d", "2026-04-01")];
  eq(sitesInsidePlan(sites, { maxSites: 3 }).map((s) => s.id).join(","), "a,b,c", "covered");
});

await test("a site with no createdAt counts as oldest, the same rule the scheduler always used", () => {
  const sites = [site("new", "2026-05-01"), site("legacy", null)];
  eq(sitesInsidePlan(sites, { maxSites: 1 })[0].id, "legacy", "covered");
});

await test("ties are broken by id, so coverage doesn't depend on read order", () => {
  const a = sitesInsidePlan([site("y", "2026-01-01"), site("x", "2026-01-01")], { maxSites: 1 });
  const b = sitesInsidePlan([site("x", "2026-01-01"), site("y", "2026-01-01")], { maxSites: 1 });
  eq(a[0].id, "x", "first order");
  eq(b[0].id, "x", "second order");
});

await test("Firestore Timestamps are understood", () => {
  eq(millisOf({ toMillis: () => 42 }), 42, "toMillis");
  eq(millisOf(new Date(7)), 7, "Date");
  eq(millisOf(undefined), 0, "missing");
});

await test("a plan with no sites covers none", () => {
  eq(sitesInsidePlan([site("a", null)], { maxSites: 0 }).length, 0, "covered");
});

suite("SITE_ID — what counts as a site id");

await test("Firestore auto-ids are accepted", () => {
  truthy(SITE_ID.test("aB3dE5fG7hJ9kL1mN3pQ"), "20-char auto id");
});

await test("anything that could address another document path is refused", () => {
  for (const bad of ["a/b", "../x", "", "a b", "x".repeat(129), "sites/other/usage"]) {
    truthy(!SITE_ID.test(bad), `refused ${JSON.stringify(bad.slice(0, 20))}`);
  }
});

report();
