// The admin console's pure checks: roles and permissions, licence overrides
// and seats, the second-factor cookie, secrets at rest, the audit log's
// filters and CSV, and feature flags.
//   node --no-warnings --import ./tests/_register.mjs tests/adminConsole.test.mjs
import { suite, test, eq, truthy, skipped, report } from "./_harness.mjs";

// A throwaway key for this process only, set before anything reads it.
process.env.ADMIN_SECRET_KEY = "test-only-key-0123456789abcdef-0123456789";

const R = await import("../lib/rbac.js");
const E = await import("../lib/entitlements.js");
const { PLANS, FEATURES } = await import("../lib/plans.js");
const A = await import("../lib/adminAuth.js");
const Q = await import("../lib/auditQuery.js");
const { featureEnabled } = await import("../lib/platform.js");

const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const lic = (over = {}) => ({ plan: "growth", status: "active", currentPeriodEnd: future, ...over });

suite("lib/rbac.js — roles are made of one scope's keys");

await test("every built-in role holds only keys from its own scope", () => {
  for (const role of Object.values(R.BUILT_IN_ROLES)) {
    eq(R.validateRole(role), null, role.id);
  }
});

await test("an org role can't be handed a platform permission", () => {
  const problem = R.validateRole({ scope: "org", name: "Sneaky", permissions: ["sites.read", "platform.users.write"] });
  truthy(problem && problem.includes("platform.users.write"), problem);
});

await test("a platform role can't be handed an org permission", () => {
  truthy(R.validateRole({ scope: "platform", name: "Odd", permissions: ["publish"] }), "refused");
});

await test("empty, unnamed, duplicated, unknown-scope and inherited keys are refused", () => {
  truthy(R.validateRole({ scope: "org", name: "None", permissions: [] }), "no permissions");
  truthy(R.validateRole({ scope: "org", name: "  ", permissions: ["sites.read"] }), "blank name");
  truthy(R.validateRole({ scope: "org", name: "x".repeat(61), permissions: ["sites.read"] }), "long name");
  truthy(R.validateRole({ scope: "org", name: "Twice", permissions: ["sites.read", "sites.read"] }), "duplicate");
  truthy(R.validateRole({ scope: "god", name: "God", permissions: ["sites.read"] }), "scope");
  truthy(R.validateRole({ scope: "org", name: "Proto", permissions: ["toString"] }), "an Object.prototype name is not a permission");
});

await test("Support is read-only; Admin can't manage admins or roles; Owner can do everything", () => {
  const support = R.BUILT_IN_ROLES.platform_support.permissions;
  truthy(support.every((p) => p.endsWith(".read")), support.join(","));
  const admin = R.BUILT_IN_ROLES.platform_admin.permissions;
  eq(admin.includes("platform.admins.manage"), false, "admin manages admins");
  eq(admin.includes("platform.roles.manage"), false, "admin manages roles");
  eq(R.BUILT_IN_ROLES.platform_owner.permissions.length, Object.keys(R.PERMISSIONS.platform).length, "owner has all");
});

await test("an org Viewer can't run work, publish or manage anything", () => {
  const viewer = R.BUILT_IN_ROLES.org_viewer.permissions;
  for (const p of ["work.run", "publish", "sites.manage", "members.manage", "integrations.manage", "approvals.decide"]) {
    eq(R.has(viewer, p), false, p);
  }
});

await test("has() is exact and safe on junk", () => {
  eq(R.has(["sites.read"], "sites.read"), true, "present");
  eq(R.has(["sites.read"], "sites"), false, "prefix");
  eq(R.has(null, "sites.read"), false, "null");
  eq(R.has("sites.read", "sites.read"), false, "a string is not a list");
});

await test("isBuiltIn() doesn't answer yes to inherited names", () => {
  eq(R.isBuiltIn("org_owner"), true, "org_owner");
  eq(R.isBuiltIn("constructor"), false, "constructor");
  eq(R.isBuiltIn("custom123"), false, "custom");
});

suite("canActOnAdmin — the Lawzer rule");

const owner = { uid: "o", roleId: "platform_owner", permissions: R.BUILT_IN_ROLES.platform_owner.permissions };
const adminA = { uid: "a", roleId: "platform_admin", permissions: R.BUILT_IN_ROLES.platform_admin.permissions };
const custom = { uid: "c", roleId: "x", permissions: ["platform.dashboard.read", "platform.admins.manage"] };

await test("nobody acts on an owner, owners included", () => {
  eq(R.canActOnAdmin(owner, { uid: "o2", roleId: "platform_owner" }), false, "owner on owner");
  eq(R.canActOnAdmin(custom, { uid: "o", roleId: "platform_owner" }), false, "manager on owner");
});

await test("nobody acts on themselves", () => {
  eq(R.canActOnAdmin(owner, { uid: "o", roleId: "platform_owner" }), false, "owner");
  eq(R.canActOnAdmin(custom, { uid: "c", roleId: "x" }), false, "custom");
});

await test("only platform.admins.manage acts on another admin", () => {
  eq(R.canActOnAdmin(owner, { uid: "a", roleId: "platform_admin" }), true, "owner on admin");
  eq(R.canActOnAdmin(custom, { uid: "a", roleId: "platform_admin" }), true, "custom manager on admin");
  eq(R.canActOnAdmin(adminA, { uid: "s", roleId: "platform_support" }), false, "admin on support");
});

suite("lib/entitlements.js — licences, overrides and seats");

await test("a licence that hasn't started entitles nothing yet", () => {
  eq(E.activePlan(lic({ startsAt: future })).id, "free", "future start");
  eq(E.activePlan(lic({ startsAt: new Date(Date.now() - 1000).toISOString() })).id, "growth", "started");
});

await test("an ended or revoked licence is lapsed, whatever its plan", () => {
  eq(E.activePlan(lic({ currentPeriodEnd: new Date(Date.now() - 1000).toISOString() })).id, "lapsed", "ended");
  eq(E.activePlan(lic({ status: "revoked" })).id, "lapsed", "revoked");
});

await test("overrides change exactly the limits they name", () => {
  const p = E.activePlan(lic({ overrides: { credits: 12345, seats: 7 } }));
  eq(p.credits, 12345, "credits");
  eq(p.seats, 7, "seats");
  eq(p.contentPieces, PLANS.growth.contentPieces, "untouched");
  eq(p.overridden, true, "marked");
});

await test("malformed overrides fall back to the plan, never above it by accident", () => {
  const p = E.activePlan(lic({ overrides: { credits: -5, seats: "999", maxSites: 1.5, contentPieces: 1e12, bogus: 1 } }));
  eq(p.credits, PLANS.growth.credits, "negative");
  eq(p.seats, PLANS.growth.seats, "string");
  eq(p.maxSites, PLANS.growth.maxSites, "fraction");
  eq(p.contentPieces, PLANS.growth.contentPieces, "absurd");
  eq(p.overridden, undefined, "nothing applied");
});

await test("the autonomy ceiling can't be overridden past 100", () => {
  eq(E.activePlan(lic({ overrides: { maxAutonomy: 500 } })).maxAutonomy, 100, "clamped");
});

await test("features can be added and taken away; unknown ones are ignored", () => {
  const all = Object.values(FEATURES);
  const missing = all.find((f) => !PLANS.growth.features.includes(f));
  const present = PLANS.growth.features[0];
  const p = E.activePlan(lic({ overrides: { featuresAdd: [missing, "made_up"].filter(Boolean), featuresRemove: [present] } }));
  if (missing) eq(p.features.includes(missing), true, "added");
  eq(p.features.includes(present), false, "removed");
  eq(p.features.includes("made_up"), false, "unknown ignored");
});

await test("seats = sites on every plan (decided 2026-10-14)", () => {
  for (const id of ["free", "starter", "growth", "pro", "agency"]) {
    if (!PLANS[id]) continue;
    eq(PLANS[id].seats, PLANS[id].maxSites, id);
  }
});

await test("a pending invitation holds a seat", () => {
  const seats = PLANS.growth.seats;
  eq(E.seatAccess(lic(), { members: seats - 1, pendingInvites: 0 }).allowed, true, "one free");
  eq(E.seatAccess(lic(), { members: seats - 1, pendingInvites: 1 }).allowed, false, "invite took it");
  eq(E.seatAccess(lic({ overrides: { seats: seats + 2 } }), { members: seats, pendingInvites: 1 }).allowed, true, "override adds seats");
});

suite("lib/adminAuth.js — the second factor and secrets at rest");

await test("a signed 2FA cookie vouches for its own uid until it expires", () => {
  const exp = Date.now() + 60_000;
  const t = A.signMfa("u1", exp);
  eq(A.verifyMfa(t, "u1"), "u1", "valid");
  eq(A.verifyMfa(t, "u2"), null, "someone else's");
  eq(A.verifyMfa(t, "u1", exp + 1), null, "expired");
});

await test("a forged or tampered 2FA cookie is refused", () => {
  const t = A.signMfa("u1", Date.now() + 60_000);
  const [body, mac] = t.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ uid: "u1", exp: Date.now() + 9e12 })).toString("base64url");
  eq(A.verifyMfa(`${forgedBody}.${mac}`, "u1"), null, "body swapped");
  // Change the first character to a different one. Swapping the last two for
  // "AA" was a no-op whenever the signature already ended in AA (1 in 4096).
  const altered = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
  eq(A.verifyMfa(`${body}.${altered}`, "u1"), null, "mac altered");
  eq(A.verifyMfa(`${body}.`, "u1"), null, "no mac");
  eq(A.verifyMfa("garbage", "u1"), null, "garbage");
  eq(A.verifyMfa(undefined, "u1"), null, "missing");
});

await test("a cookie signed with another key is refused", () => {
  const t = A.signMfa("u1", Date.now() + 60_000);
  const saved = process.env.ADMIN_SECRET_KEY;
  process.env.ADMIN_SECRET_KEY = "another-key-entirely-0123456789abcdef-xyz";
  try {
    eq(A.verifyMfa(t, "u1"), null, "other key");
  } finally {
    process.env.ADMIN_SECRET_KEY = saved;
  }
});

await test("TOTP secrets are encrypted at rest and authenticated", () => {
  const blob = A.encryptSecret("JBSWY3DPEHPK3PXP");
  truthy(!blob.includes("JBSWY3DPEHPK3PXP"), "not stored in the clear");
  truthy(A.encryptSecret("JBSWY3DPEHPK3PXP") !== blob, "a fresh IV each time");
  eq(A.decryptSecret(blob), "JBSWY3DPEHPK3PXP", "round trip");
  const [iv, tag, enc] = blob.split(".");
  const flipped = Buffer.from(enc, "base64url");
  flipped[0] ^= 1;
  let threw = false;
  try {
    A.decryptSecret(`${iv}.${tag}.${flipped.toString("base64url")}`);
  } catch {
    threw = true;
  }
  eq(threw, true, "a tampered ciphertext fails authentication");
});

await test("a short or missing ADMIN_SECRET_KEY switches the console off", () => {
  const saved = process.env.ADMIN_SECRET_KEY;
  try {
    process.env.ADMIN_SECRET_KEY = "too-short";
    eq(A.adminConsoleConfigured(), false, "short");
    eq(A.verifyMfa("a.b", "u1"), null, "nothing verifies");
    delete process.env.ADMIN_SECRET_KEY;
    eq(A.adminConsoleConfigured(), false, "missing");
  } finally {
    process.env.ADMIN_SECRET_KEY = saved;
  }
});

await test("ADMIN_UIDS parses to a clean list", () => {
  const saved = process.env.ADMIN_UIDS;
  try {
    process.env.ADMIN_UIDS = " a , b,,c ";
    eq(A.ownerUids().join("|"), "a|b|c", "parsed");
    delete process.env.ADMIN_UIDS;
    eq(A.ownerUids().length, 0, "none");
  } finally {
    if (saved === undefined) delete process.env.ADMIN_UIDS;
    else process.env.ADMIN_UIDS = saved;
  }
});

suite("requireAdmin — the guard on every /api/admin route");

const req = ({ method = "GET", origin = null, cookies = {} } = {}) => ({
  method,
  headers: new Headers(origin ? { origin, host: "localhost:3000" } : { host: "localhost:3000" }),
  cookies: { get: (name) => (cookies[name] ? { value: cookies[name] } : undefined) },
});

await test("without the server configured, every request is refused with 503", async () => {
  const saved = process.env.ADMIN_SECRET_KEY;
  try {
    delete process.env.ADMIN_SECRET_KEY;
    const r = await A.requireAdmin(req(), "platform.users.read");
    eq(r.ok, false, "refused");
    eq(r.response.status, 503, "status");
  } finally {
    process.env.ADMIN_SECRET_KEY = saved;
  }
});

if (A.adminConsoleConfigured()) {
  await test("a mutation from another origin is refused before anything else", async () => {
    const r = await A.requireAdmin(req({ method: "POST", origin: "https://evil.example" }), "platform.users.write");
    eq(r.response.status, 403, "foreign origin");
    const r2 = await A.requireAdmin(req({ method: "POST" }), "platform.users.write");
    eq(r2.response.status, 403, "no origin at all");
  });

  await test("no session or no second-factor cookie is a 401", async () => {
    eq((await A.requireAdmin(req(), null)).response.status, 401, "neither");
    eq((await A.requireAdmin(req({ cookies: { [A.SESSION_COOKIE]: "x" } }), null)).response.status, 401, "session only");
    eq((await A.requireAdmin(req({ cookies: { [A.MFA_COOKIE]: A.signMfa("u", Date.now() + 1e5) } }), null)).response.status, 401, "2FA only");
  });
} else {
  skipped("origin and missing-cookie checks", "no service account in this environment; tests/adminGuard.test.mjs covers them against the dev server");
}

suite("lib/auditQuery.js — filters and export");

const qs = (o) => new URLSearchParams(o);
const entry = { action: "license.issue", targetType: "org", actorEmail: "Ops@Example.com", targetLabel: "Acme", targetId: "org1", note: "renewal" };

await test("action filters by prefix, target type exactly, text anywhere, case-insensitively", () => {
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ action: "license." }))), true, "prefix");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ action: "issue" }))), false, "not a prefix");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ targetType: "ORG" }))), true, "type");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ targetType: "user" }))), false, "other type");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ q: "ops@example" }))), true, "actor");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ q: "RENEW" }))), true, "note");
  eq(Q.auditMatches(entry, Q.auditFilters(qs({ q: "nothing" }))), false, "miss");
});

await test("dates are whole days, \"to\" inclusive; junk dates are ignored", () => {
  const f = Q.auditFilters(qs({ from: "2026-10-01", to: "2026-10-14" }));
  eq(f.from.toISOString(), "2026-10-01T00:00:00.000Z", "from");
  eq(f.to.toISOString(), "2026-10-15T00:00:00.000Z", "to covers the 14th");
  eq(Q.auditFilters(qs({ from: "yesterday", to: "2026-13-45" })).from, null, "junk from");
  eq(Q.auditFilters(qs({ to: "2026-13-45" })).to, null, "junk to");
});

await test("CSV cells are quoted and can't run as spreadsheet formulas", () => {
  eq(Q.csvCell('say "hi"'), '"say ""hi"""', "quotes");
  eq(Q.csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"', "=");
  for (const lead of ["+", "-", "@", "\t", "\r"]) truthy(Q.csvCell(`${lead}1`).startsWith("\"'"), JSON.stringify(lead));
  eq(Q.csvCell(null), '""', "null");
  eq(Q.csvCell({ a: 1 }), '"{""a"":1}"', "object");
});

suite("lib/platform.js — feature flags");

await test("an organisation's override wins; unset is on; flags never grant", () => {
  eq(featureEnabled({}, {}, "x"), true, "default on");
  eq(featureEnabled({ x: { enabled: false } }, {}, "x"), false, "global off");
  eq(featureEnabled({ x: { enabled: false } }, { x: true }, "x"), true, "org on over global off");
  eq(featureEnabled({ x: { enabled: true } }, { x: false }, "x"), false, "org off over global on");
  eq(featureEnabled({ x: { enabled: "no" } }, { x: "yes" }, "x"), true, "junk is ignored");
});

report();
