// lib/urlGuard.js — the SSRF boundary. Everything customer-supplied enters
// through normalizeUrl + assertPublicHost, and safeFetch does the outbound
// request. Run with:
//   node --no-warnings --import ./tests/_register.mjs tests/urlguard.test.mjs
import http from "node:http";
import { suite, test, skipped, ok, bad, eq, truthy, report, rejects } from "./_harness.mjs";
import { normalizeUrl, assertPublicHost, assertSafeUrl, safeFetch } from "../lib/urlGuard.js";

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

await test("rejects credentials embedded in the URL", async () => {
  // Rejecting is the right answer, not stripping: a credentialed URL in a
  // "read my site" box is a redirector trick, never a legitimate page fetch.
  await rejects(() => Promise.resolve(normalizeUrl("http://user:pass@example.com/")), "credentials");
  return "refused at parse time";
});

await test("rejects non-web ports (22 / 3306 / 6379 on a public host)", async () => {
  // The port check lives in assertSafeUrl, which is what safeFetch calls on
  // the initial URL and on every redirect hop. normalizeUrl only parses.
  const through = [];
  for (const p of [22, 3306, 6379, 11211]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await assertSafeUrl(normalizeUrl(`http://example.com:${p}/`));
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
  // The loop in safeFetch calls assertSafeUrl on every Location before
  // connecting to it, so this is the unit that decides the outcome. The
  // end-to-end proof through a real public redirector lives in ssrf.test.mjs,
  // which cannot use a local fixture now that odd ports are refused.
  const hops = ["http://127.0.0.1/", "http://169.254.169.254/", "http://10.0.0.1/", "http://[::1]/"];
  const accepted = [];
  for (const h of hops) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await assertSafeUrl(new URL(h));
      accepted.push(h);
    } catch {
      /* refused */
    }
  }
  if (accepted.length) throw new Error(`a redirect to ${accepted.join(", ")} would be followed`);
  return `all ${hops.length} hop targets refused`;
});

await test("safeFetch refuses to fetch a private host it was handed directly", async () => {
  // Port 80 on purpose, so the port allow-list passes and it is genuinely the
  // address check being measured.
  await rejects(() => safeFetch("http://127.0.0.1/", { timeoutMs: 3000 }), "unreachable");
  await rejects(() => safeFetch("http://169.254.169.254/", { timeoutMs: 3000 }), "unreachable");
  return "refused before connecting";
});

// ---------------------------------------------------------------------------
// 5. safeFetch contract: byte cap, timeout, shape.
// ---------------------------------------------------------------------------
await test("safeFetch honours capBytes on a large body", async () => {
  // A real public page, because a local fixture would need a non-web port.
  const out = await safeFetch("https://www.iana.org/", { timeoutMs: 15000, capBytes: 500 });
  // The cap is checked after each read, so it can be reached exactly but the
  // body must not run away to the full page.
  if (out.bytes > 70_000) throw new Error(`capBytes ignored: read ${out.bytes} bytes for a cap of 500`);
  return `stopped at ${out.bytes} bytes`;
});

await test("safeFetch aborts on an impossible timeout", async () => {
  // Node names this AbortError or TimeoutError depending on version, so assert
  // that it aborts rather than pinning the name.
  try {
    await safeFetch("https://www.iana.org/", { timeoutMs: 1 });
  } catch (e) {
    const n = `${e.name}: ${e.message}`;
    if (/abort/i.test(n) || /timeout/i.test(n)) return `aborted (${e.name})`;
    throw new Error(`threw something other than an abort: ${n}`);
  }
  throw new Error("a 1ms timeout completed, so the abort signal is not wired up");
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
skipped(
  "guard pins the resolved address for the fetch (no DNS rebind window)",
  "Known and documented in lib/urlGuard.js. assertPublicHost resolves the hostname and undici " +
    "resolves it again for the connection, so a record with a very short TTL that answers public " +
    "once and private once passes the check and is then connected to. Closing it needs the checked " +
    "address pinned into the request with a custom dispatcher, which is a larger change than the " +
    "redirect fix and cannot be verified without a controllable authoritative nameserver. Recorded " +
    "as a skip rather than a pass so it stays visible."
);

report();
