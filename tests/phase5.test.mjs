// Phase 5 logic that has no screen to test it through: the customer's data
// rules reaching the checks, and which runs count as really in progress.
//   node --no-warnings --import ./tests/_register.mjs tests/phase5.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const P = await import("../lib/dataPolicy.js");

suite("effectivePolicy — the Data & privacy rules are the ones applied");

await test("a customer's 'never' for named people in the UK is what policyCheck sees", () => {
  const stored = { levels: { [P.LEVELS.NAMED_PERSON]: { UK: P.DECISIONS.NEVER } } };
  const policy = P.effectivePolicy(stored);
  eq(P.policyCheck({ level: P.LEVELS.NAMED_PERSON, jurisdiction: "UK", policy }).decision, P.DECISIONS.NEVER, "customer's choice");
  eq(P.policyCheck({ level: P.LEVELS.NAMED_PERSON, jurisdiction: "UK" }).decision, P.DEFAULT_POLICY.levels[P.LEVELS.NAMED_PERSON].UK, "the default is different, so the rule matters");
});

await test("junk in the stored document can't loosen anything or reach the fixed rules", () => {
  const stored = {
    levels: { [P.LEVELS.NAMED_PERSON]: { EU: "yes please", US: P.DECISIONS.ALLOWED }, bogus: { EU: P.DECISIONS.ALLOWED } },
    specialCategory: P.DECISIONS.ALLOWED,
    retentionDays: { active: 99999, rejected: 99999 },
  };
  const policy = P.effectivePolicy(stored);
  eq(policy.levels[P.LEVELS.NAMED_PERSON].EU, P.DEFAULT_POLICY.levels[P.LEVELS.NAMED_PERSON].EU, "an invalid decision is ignored");
  eq(policy.levels[P.LEVELS.NAMED_PERSON].US, P.DECISIONS.ALLOWED, "a valid one applies");
  eq(policy.levels.bogus, undefined, "an unknown level is dropped");
  eq(policy.specialCategory, P.DECISIONS.NEVER, "special-category data stays never");
  eq(policy.retentionDays.active, P.DEFAULT_POLICY.retentionDays.active, "retention isn't the customer's to change");
});

await test("no stored rules means the defaults", () => {
  eq(JSON.stringify(P.effectivePolicy(null).levels), JSON.stringify(P.DEFAULT_POLICY.levels), "defaults");
});

await test("a declined lead is kept for the rejected period, not the active one", () => {
  const from = new Date("2026-10-15T00:00:00Z");
  const r = P.retentionFor({ status: "declined", policy: P.effectivePolicy(null), from });
  eq(r.days, P.DEFAULT_POLICY.retentionDays.rejected, "days");
  truthy(r.days < P.DEFAULT_POLICY.retentionDays.active, "shorter than active");
});

report();
