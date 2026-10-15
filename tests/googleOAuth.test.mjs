// The Search Console connection's pure parts: the signed state that ties
// Google's answer to an organisation, and the consent URL that makes Google
// return a lasting (refresh) token.
//   node --no-warnings --import ./tests/_register.mjs tests/googleOAuth.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";

// A throwaway key for this process only, set before anything reads it.
process.env.ADMIN_SECRET_KEY = "test-only-key-0123456789abcdef-0123456789";

const G = await import("../lib/googleOAuth.js");

suite("lib/googleOAuth.js — state");

await test("a state we signed comes back with its organisation, person and site", () => {
  const s = G.verifyState(G.signState({ orgId: "org1", uid: "u1", siteId: "site1" }));
  eq(s?.orgId, "org1", "orgId");
  eq(s?.uid, "u1", "uid");
  eq(s?.siteId, "site1", "siteId");
});

await test("a changed organisation, a forged mac or junk is refused", () => {
  const state = G.signState({ orgId: "org1", uid: "u1", siteId: null });
  const [body, mac] = state.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  const moved = Buffer.from(JSON.stringify({ ...payload, orgId: "someone-else" })).toString("base64url");
  eq(G.verifyState(`${moved}.${mac}`), null, "body changed");
  eq(G.verifyState(`${body}.${"A".repeat(mac.length)}`), null, "mac forged");
  eq(G.verifyState(""), null, "empty");
  eq(G.verifyState("no-dot"), null, "no mac");
  eq(G.verifyState(null), null, "null");
});

await test("a state expires after ten minutes", () => {
  const state = G.signState({ orgId: "org1", uid: "u1" });
  truthy(G.verifyState(state, Date.now() + 9 * 60_000), "still good at nine minutes");
  eq(G.verifyState(state, Date.now() + 11 * 60_000), null, "gone at eleven");
});

await test("a state signed under another secret is refused", () => {
  const state = G.signState({ orgId: "org1", uid: "u1" });
  const before = process.env.ADMIN_SECRET_KEY;
  process.env.ADMIN_SECRET_KEY = "another-test-key-0123456789abcdef-012345";
  try {
    eq(G.verifyState(state), null, "other key");
  } finally {
    process.env.ADMIN_SECRET_KEY = before;
  }
});

suite("lib/googleOAuth.js — consent URL");

await test("asks for read-only Search Console, offline, with consent, back to our callback", () => {
  const u = new URL(G.authUrl({ origin: "https://www.getmadbot.com", state: "st" }));
  eq(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth", "Google's endpoint");
  eq(u.searchParams.get("scope"), "https://www.googleapis.com/auth/webmasters.readonly", "read-only scope, nothing wider");
  eq(u.searchParams.get("access_type"), "offline", "a refresh token");
  truthy(u.searchParams.get("prompt").includes("consent"), "consent, so a reconnect gets a refresh token too");
  eq(u.searchParams.get("redirect_uri"), "https://www.getmadbot.com/api/search-console/callback", "callback");
  eq(u.searchParams.get("response_type"), "code", "code flow");
  eq(u.searchParams.get("state"), "st", "state");
});

await test("configured only with the client secret and a long enough key", () => {
  const before = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_SECRET;
  eq(G.oauthConfigured(), false, "no secret");
  process.env.GOOGLE_CLIENT_SECRET = "x";
  eq(G.oauthConfigured(), true, "secret and key");
  if (before === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = before;
});

await test("the callback origin is the site, or localhost only in development", () => {
  const req = (host) => ({ headers: new Headers({ host }) });
  // Tests run outside production, so localhost is honoured and anything else isn't.
  eq(G.originFor(req("localhost:3000")), "http://localhost:3000", "localhost");
  truthy(G.originFor(req("evil.example")).startsWith("https://"), "an arbitrary host falls back to the site");
  truthy(!G.originFor(req("localhost.evil.example")).includes("evil"), "lookalike host refused");
});

report();
