// Public API routes on the dev server: /api/audit, /api/snapshot,
// /api/read-site, /api/region — malformed and hostile input.
//   node --no-warnings tests/api.test.mjs
// (needs `next dev` on http://localhost:3000)
import { suite, test, ok, bad, eq, truthy, report } from "./_harness.mjs";

const BASE = process.env.MADBOT_BASE || "http://localhost:3000";
const TIMEOUT_MS = 25_000;

let ipCounter = 0;
/** A fresh forwarded IP per call so /api/audit's 12-per-minute throttle
 *  doesn't mask the behaviour under test. */
function freshIp() {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

async function call(path, { headers = {} } = {}) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "x-forwarded-for": freshIp(), ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { hung: true, elapsed: Date.now() - started, err };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, text, json, elapsed: Date.now() - started, ctype: res.headers.get("content-type") || "" };
}

const STACKY = /\bat\s+\w+[^\n]*\(?(?:\/|[A-Za-z]:\\)[^\n]*:\d+:\d+\)?|node_modules|node:internal|webpack-internal|ERR_[A-Z_]+|\.next[/\\]/;

const NASTY = [
  ["no url param", ""],
  ["empty url", "?url="],
  ["whitespace url", "?url=%20%20%20"],
  ["5000-char url", `?url=${encodeURIComponent("https://example.com/" + "a".repeat(4970))}`],
  ["localhost", "?url=localhost"],
  ["loopback ip", "?url=http%3A%2F%2F127.0.0.1%2F"],
  ["cloud metadata", "?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F"],
  ["file scheme", "?url=file%3A%2F%2F%2Fetc%2Fpasswd"],
  ["javascript scheme", "?url=javascript%3Aalert(1)"],
  ["null byte", "?url=https%3A%2F%2Fexample.com%2F%00"],
  ["null byte in host", "?url=http%3A%2F%2Fexample%00.com%2F"],
  ["unicode url", "?url=https%3A%2F%2Fexample.com%2F%E6%97%A5%E6%9C%AC%E8%AA%9E%F0%9F%98%80"],
  ["IDN domain", "?url=https%3A%2F%2F%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80.%D1%80%D1%84%2F"],
  ["punycode domain", "?url=https%3A%2F%2Fxn--e1afmkfd.xn--p1ai%2F"],
  ["control chars", "?url=%0d%0aSet-Cookie%3A%20x%3D1"],
  ["array param", "?url=a&url=b"],
];

const ROUTES = ["/api/audit", "/api/snapshot", "/api/read-site"];

for (const route of ROUTES) {
  suite(`${route} — hostile input`);
  const statuses = [];

  for (const [label, qs] of NASTY) {
    await test(`${label}: JSON body, no stack trace, no 500, no hang`, async () => {
      const r = await call(`${route}${qs}`);
      if (r.hung) throw new Error(`no response within ${TIMEOUT_MS}ms (${r.err?.name})`);
      statuses.push({ label, status: r.status, error: r.json?.error ?? null, ok: r.json?.ok });

      if (r.status >= 500) throw new Error(`HTTP ${r.status} — server error. Body: ${r.text.slice(0, 300)}`);
      if (!r.json) throw new Error(`response was not JSON (content-type ${r.ctype}): ${r.text.slice(0, 300)}`);
      if (STACKY.test(r.text)) throw new Error(`response leaks internals: ${r.text.slice(0, 400)}`);
      if (r.json.ok === false || r.status >= 400) {
        if (typeof r.json.error !== "string" || !r.json.error.trim()) {
          throw new Error(`failure body has no human-readable "error" string: ${r.text.slice(0, 300)}`);
        }
        if (/Error:|TypeError|getaddrinfo|ECONN|undefined/.test(r.json.error)) {
          throw new Error(`"error" is a raw internal message, not user-facing: ${JSON.stringify(r.json.error)}`);
        }
      }
      return `HTTP ${r.status} in ${r.elapsed}ms — ${JSON.stringify(r.json.error ?? r.json.ok).slice(0, 70)}`;
    });
  }

  await test(`${route}: every input the route itself rejects answers with a 4xx`, async () => {
    // A target that answered with its own 4xx/5xx is an upstream fact, not a
    // bad request to us — those legitimately come back 200 {ok:false}. What
    // has to be 4xx is input this route refused: unparseable, non-public, or
    // unresolvable.
    const upstream = /responded with \d{3}/i;
    const refused = statuses.filter((s) => s.ok === false && !upstream.test(String(s.error)));
    const notFourXx = refused.filter((s) => !(s.status >= 400 && s.status < 500));
    if (notFourXx.length) {
      throw new Error(
        `${notFourXx.length}/${refused.length} refused inputs answered outside 4xx: ` +
          notFourXx.map((s) => `${s.label}=HTTP ${s.status} (${JSON.stringify(String(s.error).slice(0, 45))})`).join(", ")
      );
    }
    return `${refused.length} refusals, all 4xx (${statuses.filter((s) => s.ok !== false).length} inputs actually succeeded)`;
  });
}

// ---------------------------------------------------------------------------
suite("/api/audit — throttle and happy path");

await test("a valid public URL still audits", async () => {
  const r = await call(`/api/audit?url=${encodeURIComponent("https://example.com/")}`);
  if (r.hung) throw new Error("hung");
  eq(r.status, 200, "status");
  eq(r.json?.ok, true, "ok");
  truthy(typeof r.json.score === "number", "score is numeric");
  return `score ${r.json.score}, ${r.json.findings.length} findings`;
});

await test("the per-IP throttle engages and answers 429 with JSON", async () => {
  const ip = "203.0.113.77";
  let saw429 = false;
  let last = null;
  for (let i = 0; i < 15; i += 1) {
    const r = await fetch(`${BASE}/api/audit?url=`, {
      headers: { "x-forwarded-for": ip },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    last = r.status;
    if (r.status === 429) {
      const body = await r.json();
      if (typeof body.error !== "string") throw new Error("429 body has no error string");
      saw429 = true;
      break;
    }
    await r.text();
  }
  if (!saw429) throw new Error(`15 requests from one IP never hit the 12-per-minute throttle (last status ${last})`);
  return "429 after the window filled";
});

// ---------------------------------------------------------------------------
suite("/api/region");

await test("returns the documented shape", async () => {
  const r = await call("/api/region");
  if (r.hung) throw new Error("hung");
  eq(r.status, 200, "status");
  for (const k of ["ok", "country", "region", "detected", "currency"]) {
    if (!(k in r.json)) throw new Error(`missing key "${k}"`);
  }
  eq(r.json.ok, true, "ok");
  return `region ${r.json.region} / ${r.json.currency}, detected=${r.json.detected}`;
});

const REGION_HEADERS = [
  ["known country", { "x-vercel-ip-country": "IN" }, (j) => j.region === "IN" && j.detected === true],
  ["lowercase country", { "x-vercel-ip-country": "de" }, (j) => j.region === "EU" && j.detected === true],
  ["unknown country", { "x-vercel-ip-country": "ZZ" }, (j) => j.detected === false && j.region === "US"],
  ["empty country", { "x-vercel-ip-country": "" }, (j) => j.detected === false],
  ["prototype-pollution-ish", { "x-vercel-ip-country": "__proto__" }, (j) => j.detected === false && !!j.currency],
  ["constructor", { "x-vercel-ip-country": "constructor" }, (j) => j.detected === false && !!j.currency],
  ["very long header", { "x-vercel-ip-country": "A".repeat(2000) }, (j) => j.detected === false && !!j.currency],
  ["cf fallback", { "cf-ipcountry": "GB" }, (j) => j.region === "GB" && j.detected === true],
];

for (const [label, headers, check] of REGION_HEADERS) {
  await test(`region header: ${label}`, async () => {
    const r = await call("/api/region", { headers });
    if (r.hung) throw new Error("hung");
    if (r.status >= 500) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    if (!r.json) throw new Error(`not JSON: ${r.text.slice(0, 200)}`);
    if (!check(r.json)) throw new Error(`unexpected: ${JSON.stringify(r.json)}`);
    return `${r.json.region} / ${r.json.currency} (detected=${r.json.detected})`;
  });
}

await test("/api/region never returns a 500 for a hostile header", async () => {
  for (const v of ["../../etc/passwd", "%00", "<script>", "toString", "hasOwnProperty"]) {
    const r = await call("/api/region", { headers: { "x-vercel-ip-country": v } });
    if (r.hung) throw new Error(`hung on ${JSON.stringify(v)}`);
    if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${JSON.stringify(v)}`);
  }
  return "5 hostile headers, all 200";
});

report();
