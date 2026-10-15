// Authentication, authorisation and input checks at the API boundary.
//   node --no-warnings --import ./tests/_register.mjs tests/apiGuard.test.mjs
//
// Runs without Firebase credentials or a dev server. The guard's pure parts
// are tested directly, and the route handlers are imported and called with
// real Request objects, so "refused before any work starts" is tested on the
// code that ships rather than on a description of it. Google's token lookup is
// stubbed: these tests are about what the routes do with a bad answer, not
// about Google.
import { suite, test, eq, truthy, report } from "./_harness.mjs";

delete process.env.FIREBASE_SERVICE_ACCOUNT_B64;

const G = await import("../lib/apiGuard.js");
const { z } = G;

const realFetch = globalThis.fetch;
/** Every outbound call answers "invalid token", the way Identity Toolkit does. */
function stubGoogleRejects() {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }), { status: 400 });
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}

const post = (url, body, headers = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const TOKEN = "x".repeat(40);

suite("readJson — bodies are bounded and validated");

const Schema = z.object({ idToken: G.fields.idToken, siteId: G.fields.siteId, note: G.fields.text(10, "The note").optional() });

await test("a body over the cap is refused by its declared length", async () => {
  const r = await G.readJson(post("/x", "{}", { "content-length": "999999" }), Schema, { maxBytes: 1000 });
  eq(r.response.status, 413, "status");
});

await test("a body over the cap is refused by its actual length when none is declared", async () => {
  const r = await G.readJson(post("/x", JSON.stringify({ pad: "a".repeat(5000) })), Schema, { maxBytes: 1000 });
  eq(r.response.status, 413, "status");
});

await test("malformed JSON is a 400, not a crash", async () => {
  const r = await G.readJson(post("/x", "{not json"), Schema);
  eq(r.response.status, 400, "status");
});

await test("a missing site id is refused with the message the dashboard shows", async () => {
  const r = await G.readJson(post("/x", { idToken: TOKEN }), Schema);
  eq(r.response.status, 400, "status");
  eq((await r.response.json()).error, "No site given.", "message");
});

await test("a site id that is really a path is refused", async () => {
  const r = await G.readJson(post("/x", { idToken: TOKEN, siteId: "abc/usage/2026-10" }), Schema);
  eq(r.response.status, 400, "status");
});

await test("an over-long field says which field and how long it may be", async () => {
  const r = await G.readJson(post("/x", { idToken: TOKEN, siteId: "abc", note: "a".repeat(11) }), Schema);
  truthy(/note is too long \(10 characters at most\)/i.test((await r.response.json()).error), "message");
});

await test("keys the schema doesn't name are dropped, so a route can't trust one by accident", async () => {
  const r = await G.readJson(post("/x", { idToken: TOKEN, siteId: "abc", uid: "someone-else", isAdmin: true }), Schema);
  eq(r.ok, true, "ok");
  eq("uid" in r.data || "isAdmin" in r.data, false, "extra keys present");
});

suite("identityVerdict — who may do what");

await test("no verified identity is a 401", () => {
  eq(G.identityVerdict(null)?.status, 401, "status");
});

await test("an unconfirmed email is refused where a confirmed one is required", () => {
  eq(G.identityVerdict({ uid: "u", emailVerified: false }, { verifiedEmail: true })?.code, "email_unverified", "code");
  eq(G.identityVerdict({ uid: "u", emailVerified: true }, { verifiedEmail: true }), null, "verified passes");
});

await test("an irreversible action needs a recent sign-in", () => {
  const now = 1_800_000_000;
  const opts = { recentSeconds: 600 };
  eq(G.identityVerdict({ uid: "u", authTime: now - 300 }, opts, now), null, "5 minutes ago");
  eq(G.identityVerdict({ uid: "u", authTime: now - 1200 }, opts, now)?.code, "reauth_required", "20 minutes ago");
  eq(G.identityVerdict({ uid: "u", authTime: null }, opts, now)?.code, "reauth_required", "unknown sign-in time");
});

await test("a malformed token is rejected without a network call", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    eq(await G.verifyIdentity("short"), null, "identity");
    eq(await G.verifyIdentity(undefined), null, "identity");
    eq(called, false, "network touched");
  } finally {
    restoreFetch();
  }
});

await test("a token Google rejects is no identity", async () => {
  stubGoogleRejects();
  try {
    eq(await G.verifyIdentity(TOKEN), null, "identity");
  } finally {
    restoreFetch();
  }
});

await test("a disabled account is no identity, even with a token Google still describes", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: "u1", disabled: true }] }), { status: 200 });
  try {
    eq(await G.verifyIdentity(TOKEN), null, "identity");
  } finally {
    restoreFetch();
  }
});

suite("secretMatches — shared secrets");

await test("an unset secret matches nothing, including an empty header", () => {
  eq(G.secretMatches("", undefined), false, "empty");
  eq(G.secretMatches("Bearer ", ""), false, "blank");
  eq(G.secretMatches("Bearer undefined", undefined), false, "the string undefined");
});

await test("only the exact bearer value matches", () => {
  eq(G.secretMatches("Bearer s3cret", "s3cret"), true, "exact");
  eq(G.secretMatches("Bearer s3cre", "s3cret"), false, "prefix");
  eq(G.secretMatches("Bearer s3cretX", "s3cret"), false, "longer");
  eq(G.secretMatches("s3cret", "s3cret"), false, "no scheme");
});

suite("rateLimit — the per-instance fallback used without a service account");

await test("the request after the limit gets a 429 with Retry-After", async () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  const rules = [{ limit: 2, windowSec: 60 }];
  eq((await G.rateLimit({ scope: "t", key, rules })).ok, true, "first");
  eq((await G.rateLimit({ scope: "t", key, rules })).ok, true, "second");
  const third = await G.rateLimit({ scope: "t", key, rules });
  eq(third.ok, false, "third");
  eq(third.response.status, 429, "status");
  truthy(Number(third.response.headers.get("Retry-After")) > 0, "Retry-After");
});

await test("limits are per key and per scope", async () => {
  const rules = [{ limit: 1, windowSec: 60 }];
  const k = `iso-${Date.now()}`;
  await G.rateLimit({ scope: "a", key: k, rules });
  eq((await G.rateLimit({ scope: "a", key: `${k}-other`, rules })).ok, true, "another key");
  eq((await G.rateLimit({ scope: "b", key: k, rules })).ok, true, "another scope");
});

suite("routes — refused before any work starts");

await test("/api/jobs/run refuses a job with no site, which used to run unmetered", async () => {
  const { POST } = await import("../app/api/jobs/run/route.js");
  const res = await POST(post("/api/jobs/run", { idToken: TOKEN, job: { type: "ai_visibility", params: { questions: [{ id: "q1", question: "q" }] } } }));
  eq(res.status, 400, "status");
  eq((await res.json()).error, "No site given.", "message");
});

await test("/api/jobs/run refuses more questions than one run may ask", async () => {
  const { POST } = await import("../app/api/jobs/run/route.js");
  const res = await POST(
    post("/api/jobs/run", { idToken: TOKEN, job: { type: "ai_visibility", siteId: "abc", params: { questions: Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, question: "q" })) } } })
  );
  eq(res.status, 400, "status");
});

await test("/api/jobs/run accepts questions in the shape the dashboard sends them", async () => {
  // { id, question }, as /api/visibility/questions returns them. A list of
  // strings was the old schema, and it refused every check a customer ran.
  const { POST } = await import("../app/api/jobs/run/route.js");
  const ok = await POST(
    post("/api/jobs/run", { idToken: TOKEN, job: { type: "ai_visibility", siteId: "abc", params: { questions: [{ id: "q1", question: "Who sells compliance software in India?" }] } } })
  );
  truthy(ok.status !== 400, `passed validation (got ${ok.status}: ${JSON.stringify(await ok.json()).slice(0, 120)})`);
  const bare = await POST(post("/api/jobs/run", { idToken: TOKEN, job: { type: "ai_visibility", siteId: "abc", params: { questions: ["a bare string"] } } }));
  eq(bare.status, 400, "a bare string is not a question");
});

await test("/api/jobs/run refuses an unknown job type", async () => {
  const { POST } = await import("../app/api/jobs/run/route.js");
  const res = await POST(post("/api/jobs/run", { idToken: TOKEN, job: { type: "mine_bitcoin", siteId: "abc" } }));
  eq(res.status, 400, "status");
});

await test("/api/jobs/run refuses a caller Google doesn't recognise", async () => {
  stubGoogleRejects();
  try {
    const { POST } = await import("../app/api/jobs/run/route.js");
    const res = await POST(post("/api/jobs/run", { idToken: TOKEN, job: { type: "crawl_site", siteId: "abc" } }));
    eq(res.status, 401, "status");
  } finally {
    restoreFetch();
  }
});

await test("/api/send-digest no longer accepts a subject and HTML to send", async () => {
  process.env.RESEND_API_KEY = "test-not-a-key";
  try {
    const { POST } = await import("../app/api/send-digest/route.js");
    const res = await POST(post("/api/send-digest", { idToken: TOKEN, subject: "Your account", html: "<a href=//evil>x</a>" }));
    // Without a service account it stops at 503 before reading the body; with
    // one it stops at the missing siteId. Either way, nothing is sent.
    truthy([400, 503].includes(res.status), `status ${res.status}`);
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

await test("/api/privacy/export has no GET, so a token can't travel in a URL", async () => {
  const mod = await import("../app/api/privacy/export/route.js");
  eq(typeof mod.GET, "undefined", "GET");
  eq(typeof mod.POST, "function", "POST");
});

await test("/api/leads/profile wants a site, not an intelligence blob from the browser", async () => {
  const { POST } = await import("../app/api/leads/profile/route.js");
  const res = await POST(post("/api/leads/profile", { idToken: TOKEN, intel: { business: { description: "a".repeat(10_000) } } }));
  eq(res.status, 400, "status");
});

await test("/api/visibility/questions wants a site, not an intelligence blob from the browser", async () => {
  const { POST } = await import("../app/api/visibility/questions/route.js");
  const res = await POST(post("/api/visibility/questions", { idToken: TOKEN, intel: {} }));
  eq(res.status, 400, "status");
});

await test("/api/listings/prepare refuses a directory id inherited from Object.prototype", async () => {
  const { POST } = await import("../app/api/listings/prepare/route.js");
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-not-a-key";
  const res = await POST(post("/api/listings/prepare", { idToken: TOKEN, siteId: "abc", directoryId: "constructor" }));
  eq(res.status, 400, "status");
});

await test("cron endpoints refuse without the secret, and with a near miss", async () => {
  process.env.CRON_SECRET = "the-real-secret";
  try {
    const tick = await import("../app/api/cron/tick/route.js");
    const retention = await import("../app/api/cron/retention/route.js");
    for (const [name, mod] of [["tick", tick], ["retention", retention]]) {
      const none = await mod.POST(new Request("http://localhost/x", { method: "POST" }));
      eq(none.status, 401, `${name} without a header`);
      const near = await mod.POST(
        new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer the-real-secreT" } })
      );
      eq(near.status, 401, `${name} with a near miss`);
    }
  } finally {
    delete process.env.CRON_SECRET;
  }
});

await test("public fetchers refuse an absurd URL before fetching anything", async () => {
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return new Response("", { status: 200 });
  };
  try {
    const long = `https://example.com/${"a".repeat(2100)}`;
    for (const path of ["audit", "read-site"]) {
      const { GET } = await import(`../app/api/${path}/route.js`);
      const res = await GET(new Request(`http://localhost/api/${path}?url=${encodeURIComponent(long)}`));
      eq(res.status, 400, `${path} status`);
    }
    eq(fetched, false, "anything fetched");
  } finally {
    restoreFetch();
  }
});

report();
