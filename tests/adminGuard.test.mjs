// The admin console from outside: every /api/admin route refuses a request
// without a valid session and second factor, mutations from another origin
// are refused, and the console's pages aren't indexable or reachable.
//   node --no-warnings tests/adminGuard.test.mjs
// (needs `next dev` on http://localhost:3000, with ADMIN_SECRET_KEY and the
// service account set, as in .env.local)
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const BASE = process.env.MADBOT_BASE || "http://localhost:3000";
const DEV = !/^https:/.test(BASE);
const SESSION = DEV ? "madbot_admin" : "__Host-madbot_admin";
const MFA = DEV ? "madbot_admin_2fa" : "__Host-madbot_admin_2fa";

async function call(path, { method = "GET", headers = {}, body, redirect = "manual" } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a page */
  }
  return { status: res.status, json, text, headers: res.headers };
}

// One request per route and method, with an id where the route takes one.
const READS = [
  "/api/admin/overview",
  "/api/admin/users",
  "/api/admin/users/someone",
  "/api/admin/orgs",
  "/api/admin/orgs/someorg",
  "/api/admin/roles",
  "/api/admin/plans",
  "/api/admin/flags",
  "/api/admin/usage",
  "/api/admin/audit",
  "/api/admin/audit/export",
  "/api/admin/settings",
  "/api/admin/health",
  "/api/admin/admins",
];
const WRITES = [
  ["POST", "/api/admin/users/someone", { action: "suspend" }],
  ["POST", "/api/admin/orgs", { name: "x", ownerEmail: "a@b.co" }],
  ["POST", "/api/admin/orgs/someorg", { action: "license_revoke" }],
  ["POST", "/api/admin/invites", { email: "a@b.co", orgId: "o", roleId: "org_member" }],
  ["POST", "/api/admin/roles", { scope: "org", name: "x", permissions: ["sites.read"] }],
  ["PATCH", "/api/admin/roles/r1", { name: "y" }],
  ["DELETE", "/api/admin/roles/r1", null],
  ["PUT", "/api/admin/flags", { key: "x", enabled: false }],
  ["PUT", "/api/admin/settings", { signupOpen: false }],
  ["POST", "/api/admin/admins", { action: "grant", email: "a@b.co", roleId: "platform_admin" }],
];

const forged = `${SESSION}=not-a-session; ${MFA}=${Buffer.from(JSON.stringify({ uid: "x", exp: 9e15 })).toString("base64url")}.AAAA`;

suite("/api/admin — nothing without a session");

let configured = true;
await test("the console is configured on this server (else everything is 503)", async () => {
  const r = await call("/api/admin/overview");
  if (r.status === 503) {
    configured = false;
    throw new Error("503: set ADMIN_SECRET_KEY and the service account in .env.local");
  }
  return `status ${r.status}`;
});

await test("every read is refused without cookies", async () => {
  for (const path of READS) {
    const r = await call(path);
    eq(r.status, configured ? 401 : 503, path);
    truthy(!r.json?.ok, `${path} answered ok`);
  }
  return `${READS.length} routes`;
});

await test("every read is refused with forged cookies", async () => {
  for (const path of READS) {
    const r = await call(path, { headers: { cookie: forged } });
    eq(r.status, configured ? 401 : 503, path);
  }
});

await test("every mutation from another origin is refused, cookies or not", async () => {
  for (const [method, path, body] of WRITES) {
    const r = await call(path, { method, body, headers: { origin: "https://evil.example", cookie: forged } });
    eq(r.status, configured ? 403 : 503, `${method} ${path}`);
  }
  return `${WRITES.length} mutations`;
});

await test("every same-origin mutation without a real session is refused", async () => {
  for (const [method, path, body] of WRITES) {
    const r = await call(path, { method, body, headers: { origin: BASE, cookie: forged } });
    eq(r.status, configured ? 401 : 503, `${method} ${path}`);
  }
});

await test("starting a console sign-in from another origin is refused", async () => {
  const r = await call("/api/admin/session", { method: "POST", body: { idToken: "x".repeat(40) }, headers: { origin: "https://evil.example" } });
  eq(r.status, configured ? 403 : 503, "status");
});

await test("starting one with a junk ID token gets nowhere", async () => {
  const r = await call("/api/admin/session", { method: "POST", body: { idToken: "x".repeat(40) }, headers: { origin: BASE } });
  truthy([400, 401, 404].includes(r.status), `status ${r.status}`);
  truthy(!r.json?.ok, "answered ok");
});

suite("/admin pages");

await test("the console's pages send a visitor without cookies to its sign-in", async () => {
  for (const path of ["/admin", "/admin/users", "/admin/orgs/x", "/admin/audit"]) {
    const r = await call(path);
    truthy([302, 303, 307, 308].includes(r.status), `${path}: ${r.status}`);
    truthy(new URL(r.headers.get("location"), BASE).pathname === "/admin/login", `${path} → ${r.headers.get("location")}`);
  }
});

await test("with forged cookies the server-side check still sends them to sign in", async () => {
  const r = await call("/admin", { headers: { cookie: forged } });
  truthy([302, 303, 307, 308].includes(r.status) || r.status === 200, `status ${r.status}`);
  if (r.status === 200) truthy(!r.text.includes("adm-rail"), "rendered the console");
  else eq(new URL(r.headers.get("location"), BASE).pathname, "/admin/login", "location");
});

await test("the sign-in page and the invitation page aren't indexable", async () => {
  for (const path of ["/admin/login", "/invite"]) {
    const r = await call(path);
    eq(r.status, 200, path);
    truthy(/noindex/.test(r.headers.get("x-robots-tag") || ""), `${path} X-Robots-Tag: ${r.headers.get("x-robots-tag")}`);
    truthy(/<meta name="robots" content="[^"]*noindex/.test(r.text), `${path} has no robots meta`);
  }
});

report();
