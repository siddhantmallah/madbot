// lib/urlGuard.js — the SSRF boundary. Everything customer-supplied enters
// through normalizeUrl + assertPublicHost, and safeFetch does the outbound
// request. Run with:
//   node --no-warnings --import ./tests/_register.mjs tests/urlguard.test.mjs
import http from "node:http";
import { suite, test, ok, bad, eq, truthy, report, rejects } from "./_harness.mjs";
import { normalizeUrl, assertPublicHost, safeFetch } from "../lib/urlGuard.js";

suite("lib/urlGuard.js");

/** The whole guard as a caller actually uses it: normalize, then assert. */
async function guard(input) {
  const u = normalizeUrl(input);
  await assertPublicHost(u.hostname);
  return u;
}

// ---------------------------------------------------------------------------
// 1. Must reject: loopback, in every encoding a URL parser will accept.
// ---------------------------------------------------------------------------
const MUST_REJECT = [
  ["localhost", "loopback by name"],
  ["127.0.0.1", "loopback dotted quad"],
  ["0.0.0.0", "unspecified address"],
  ["[::1]", "IPv6 loopback"],
  ["0x7f000001", "hex-encoded loopback"],
  ["2130706433", "decimal-encoded loopback"],
  ["127.1", "short-form loopback"],
  ["0177.0.0.1", "octal-encoded loopback"],
  ["http://127.0.0.1:6379/", "loopback with a Redis port"],
  ["https://127.0.0.1.nip.io/", "public hostname that resolves to loopback"],
  ["10.0.0.1", "private 10/8"],
  ["172.16.0.1", "private 172.16/12"],
  ["172.31.255.254", "private 172.16/12 upper edge"],
  ["192.168.1.1", "private 192.168/16"],
  ["169.254.169.254", "cloud metadata / link-local"],
  ["[fd00::1]", "IPv6 unique local"],
  ["[fe80::1]", "IPv6 link-local"],
  ["[::]", "IPv6 unspecified"],
  ["[::ffff:127.0.0.1]", "IPv4-mapped loopback"],
  ["[::ffff:169.254.169.254]", "IPv4-mapped metadata address"],
  ["[0:0:0:0:0:0:0:1]", "uncompressed IPv6 loopback"],
  ["file:///etc/passwd", "file scheme"],
  ["gopher://x/", "gopher scheme"],
  ["ftp://x/", "ftp scheme"],
  ["javascript:alert(1)", "javascript scheme"],
  ["data:text/html,x", "data scheme"],
  ["", "empty string"],
  ["   ", "whitespace only"],
  [null, "null"],
  ["something.local", ".local mDNS name"],
  ["svc.cluster.internal", ".internal name"],
];

for (const [input, why] of MUST_REJECT) {
  await test(`rejects ${JSON.stringify(input)} (${why})`, async () => {
    const err = await rejects(() => guard(input));
    return `${err.code || err.name}: ${String(err.message).slice(0, 60)}`;
  });
}

// ---------------------------------------------------------------------------
// 2. Must accept: ordinary public URLs.
// ---------------------------------------------------------------------------
const MUST_ACCEPT = [
  ["example.com", "bare host, no scheme"],
  ["https://example.com", "explicit https"],
  ["http://example.org", "explicit http"],
  ["https://example.com/a/b/c", "with a path"],
  ["https://example.com/search?q=hello+world&n=2", "with a query string"],
  ["example.com.", "trailing dot (root-anchored FQDN)"],
  ["EXAMPLE.COM", "uppercase host"],
  ["  https://example.com/  ", "surrounding whitespace"],
  ["https://en.wikipedia.org/wiki/Server-side_request_forgery", "real public URL with a path"],
];

for (const [input, why] of MUST_ACCEPT) {
  await test(`accepts ${JSON.stringify(input)} (${why})`, async () => {
    const u = await guard(input);
    truthy(u.hostname, "hostname");
    return u.href;
  });
}

// ---------------------------------------------------------------------------
// 3. Things the guard lets through that it arguably should not.
//    These are written as assertions of the *desired* behaviour, so each one
//    that is still open shows up as a FAIL rather than being buried in prose.
// ---------------------------------------------------------------------------

await test("strips or rejects credentials embedded in the URL", async () => {
  const u = normalizeUrl("http://user:pass@example.com/");
  await assertPublicHost(u.hostname);
  if (u.username || u.password) {
    throw new Error(
      `normalizeUrl kept credentials: username=${JSON.stringify(u.username)} password=${JSON.stringify(u.password)} ` +
        `— safeFetch(url.toString()) will send them as Basic auth to whatever host follows the redirect chain`
    );
  }
  return "credentials dropped";
});

await test("rejects non-web ports (22 / 3306 / 6379 on a public host)", async () => {
  const through = [];
  for (const p of [22, 3306, 6379, 11211]) {
    try {
      const u = normalizeUrl(`http://example.com:${p}/`);
      await assertPublicHost(u.hostname);
      through.push(p);
    } catch {
      /* rejected, as wanted */
    }
  }
  if (through.length) {
    throw new Error(`no port allow-list: ports ${through.join(", ")} accepted on a public host`);
  }
  return "non-web ports refused";
});

await test("normalizeUrl reports a protocol error for non-http schemes", async () => {
  // The `protocol` branch is what /api/audit maps to a 400 "not a valid
  // website address". If a bad scheme instead becomes a bogus hostname the
  // user gets the wrong error and the wrong status code.
  const mislabelled = [];
  for (const raw of ["file:///etc/passwd", "gopher://x/", "ftp://x/"]) {
    try {
      const u = normalizeUrl(raw);
      mislabelled.push(`${raw} -> host=${JSON.stringify(u.hostname)} href=${u.href}`);
    } catch (e) {
      if (e.message !== "protocol") mislabelled.push(`${raw} -> threw ${e.code || e.name}, not "protocol"`);
    }
  }
  if (mislabelled.length) {
    throw new Error(
      `the /^https?:\\/\\//i test prefixes "https://" before the protocol check, so the check is unreachable: ` +
        mislabelled.join(" | ")
    );
  }
  return "non-http schemes reported as protocol errors";
});

await test("blocks carrier-grade NAT 100.64.0.0/10", async () => {
  await rejects(() => guard("100.64.0.1"));
  return "100.64/10 refused";
});

await test("blocks IETF-reserved 192.0.0.0/24 and 198.18.0.0/15", async () => {
  const through = [];
  for (const ip of ["192.0.0.1", "198.18.0.1", "198.19.255.254"]) {
    try {
      await guard(ip);
      through.push(ip);
    } catch {
      /* rejected */
    }
  }
  if (through.length) throw new Error(`reserved ranges accepted: ${through.join(", ")}`);
  return "reserved ranges refused";
});

await test("blocks the NAT64 well-known prefix 64:ff9b::/96", async () => {
  await rejects(() => guard("[64:ff9b::7f00:1]"));
  return "NAT64-embedded loopback refused";
});

// ---------------------------------------------------------------------------
// 4. Redirects. safeFetch uses redirect:"follow" and re-checks nothing, so the
//    guard only ever inspects the *first* hop.
// ---------------------------------------------------------------------------
await test("safeFetch re-validates each redirect hop", async () => {
  const internal = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head><title>URLGUARD-CANARY-4417</title></head><body>internal</body></html>");
  });
  await new Promise((r) => internal.listen(0, "127.0.0.1", r));
  const iport = internal.address().port;

  const hop = http.createServer((req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${iport}/` });
    res.end();
  });
  await new Promise((r) => hop.listen(0, "127.0.0.1", r));
  const hport = hop.address().port;

  try {
    // Stands in for the attacker's own public host, which passes
    // assertPublicHost by construction and then 302s inward.
    const res = await safeFetch(`http://127.0.0.1:${hport}/`);
    if (res.body.includes("URLGUARD-CANARY-4417")) {
      throw new Error(
        `safeFetch followed a cross-host redirect to loopback and returned its body. finalUrl=${res.finalUrl}. ` +
          `redirect:"follow" with no per-hop assertPublicHost means the guard inspects only the first hop.`
      );
    }
    return "redirect hops re-validated";
  } finally {
    internal.close();
    hop.close();
  }
});

await test("safeFetch refuses to fetch a private host it was handed directly", async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("loopback-reached");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    const res = await safeFetch(`http://127.0.0.1:${port}/`);
    if (res.body.includes("loopback-reached")) {
      throw new Error(
        "safeFetch has no guard of its own — it trusts every caller to have called assertPublicHost first. " +
          "lib/crawler.js fetchSitemapUrls() calls it with URLs taken straight out of a remote robots.txt."
      );
    }
    return "refused";
  } finally {
    srv.close();
  }
});

// ---------------------------------------------------------------------------
// 5. safeFetch contract: byte cap, timeout, shape.
// ---------------------------------------------------------------------------
await test("safeFetch honours capBytes on a large body", async () => {
  const chunk = "x".repeat(64 * 1024);
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    let n = 0;
    const push = () => {
      if (n++ > 40) return res.end();
      res.write(chunk, push);
    };
    push();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    const res = await safeFetch(`http://127.0.0.1:${port}/`, { capBytes: 50_000 });
    if (res.bytes > 50_000 + 65_536) {
      throw new Error(`read ${res.bytes} bytes with capBytes=50000 — overshoot larger than one chunk`);
    }
    return `stopped at ${res.bytes} bytes (cap 50000, chunk 65536)`;
  } finally {
    srv.close();
  }
});

await test("safeFetch aborts on timeout with an AbortError", async () => {
  const srv = http.createServer(() => {
    /* never respond */
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    const err = await rejects(() => safeFetch(`http://127.0.0.1:${port}/`, { timeoutMs: 700 }));
    const name = err.name === "AbortError" || err.cause?.name === "AbortError" ? "AbortError" : err.name;
    eq(name, "AbortError", "error name");
    return "aborted";
  } finally {
    srv.close();
  }
});

await test("safeFetch returns the documented shape", async () => {
  const res = await safeFetch("https://example.com/");
  for (const k of ["ok", "status", "finalUrl", "body", "bytes", "elapsedMs"]) {
    if (!(k in res)) throw new Error(`missing key ${k}`);
  }
  eq(typeof res.elapsedMs, "number", "elapsedMs type");
  return `status ${res.status}, ${res.bytes} bytes, ${res.elapsedMs}ms`;
});

// ---------------------------------------------------------------------------
// 6. Time-of-check / time-of-use. assertPublicHost resolves the name; fetch
//    resolves it again. Nothing pins the address in between.
// ---------------------------------------------------------------------------
await test("guard pins the resolved address for the fetch (no DNS rebind window)", async () => {
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../lib/urlGuard.js", import.meta.url), "utf8")
  );
  const pins = /lookup\s*:/.test(src) || /agent\s*:/.test(src) || /connect\s*:/.test(src);
  if (!pins) {
    throw new Error(
      "assertPublicHost() resolves the hostname, then fetch() resolves it independently. A name with a short " +
        "TTL that answers public once and private once (DNS rebinding) passes the check and is then connected to. " +
        "Fixing it needs the checked address pinned into the request (custom lookup/dispatcher)."
    );
  }
  return "address pinned";
});

report();
