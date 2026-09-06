// Every outbound fetch driven by a customer-supplied URL goes through here.
//
// The threat is server-side request forgery: somebody types a URL, our server
// fetches it from inside the deployment's network, and hands the response back.
// That turns a public form into a window onto cloud metadata endpoints,
// internal admin panels and unauthenticated services on odd ports.
//
// The guard used to be a check the CALLER made on the hostname the customer
// typed, once, before the request. That was not enough, and it was bypassed two
// different ways:
//
//   1. `redirect: "follow"` meant a public host could 302 straight to
//      127.0.0.1 and the body came back through /api/audit, unauthenticated.
//      Nothing re-checked any hop after the first.
//   2. lib/crawler.js reads `Sitemap:` out of the target's own robots.txt and
//      fetched whatever it said, so any site a customer asked us to crawl
//      could point us at 169.254.169.254 with no redirector at all.
//
// So the check now lives inside safeFetch and runs on every hop. A caller
// cannot forget it, because it is no longer the caller's job.

import dns from "node:dns/promises";

// Only the ports a website is actually served on. Without this the redirect
// target could be any TCP port, which makes the fetcher an internal port
// scanner: response text and timing distinguish open from closed.
const ALLOWED_PORTS = new Set(["", "80", "443"]);

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inRange(intIp, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (intIp & mask) === (ipv4ToInt(base) & mask);
}

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  // Unparseable is treated as private. Failing closed on an address we cannot
  // reason about is the only safe default here.
  if (n === null) return true;
  return (
    inRange(n, "10.0.0.0", 8) ||
    inRange(n, "172.16.0.0", 12) ||
    inRange(n, "192.168.0.0", 16) ||
    inRange(n, "127.0.0.0", 8) ||
    inRange(n, "169.254.0.0", 16) ||
    inRange(n, "0.0.0.0", 8) ||
    // Carrier-grade NAT. Several container and cloud fabrics use this as an
    // internal range, so it is reachable from a function and must not be.
    inRange(n, "100.64.0.0", 10) ||
    // IETF protocol assignments and benchmarking ranges. No public site lives
    // here and both are routable inside some networks.
    inRange(n, "192.0.0.0", 24) ||
    inRange(n, "198.18.0.0", 15) ||
    // Multicast and reserved. Not a website either way.
    inRange(n, "224.0.0.0", 4) ||
    inRange(n, "240.0.0.0", 4)
  );
}

function isPrivateIP(address, family) {
  if (family === 4) return isPrivateIPv4(address);
  const a = address.toLowerCase();
  if (a === "::1" || a === "::") return true;
  // Link-local and both unique-local prefixes.
  if (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // NAT64. Where a gateway exists, 64:ff9b::7f00:1 reaches 127.0.0.1.
  if (a.startsWith("64:ff9b:")) return true;
  return false;
}

/**
 * Parses a URL, tolerating a missing scheme the way a person typing a domain
 * into a box would expect.
 *
 * A scheme that is present and is not http(s) is rejected here and now. The old
 * version tested for a leading `https?://` and prefixed `https://` when absent,
 * which meant `file:///etc/passwd` became `https://file:///etc/passwd`: the
 * protocol check below could never fire, and the input was eventually refused
 * seven seconds later by a DNS failure carrying the wrong error.
 */
export function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("empty");

  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) {
    if (!/^https?$/i.test(scheme[1])) throw new Error("protocol");
  } else {
    raw = "https://" + raw;
  }

  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocol");
  if (!u.hostname) throw new Error("empty");
  // Credentials in a URL are a redirector trick and no legitimate site needs
  // them for a page fetch.
  if (u.username || u.password) throw new Error("credentials");
  return u;
}

/**
 * Refuses any hostname that resolves to an address we must not reach.
 *
 * DNS failures are normalised to "unreachable" so callers can map one error to
 * one status. They used to escape as raw `getaddrinfo ENOTFOUND …`, which the
 * routes did not recognise, so a nonexistent domain answered HTTP 200 with a
 * failure body instead of a 400.
 */
export async function assertPublicHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) throw new Error("unreachable");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".localdomain")
  ) {
    throw new Error("unreachable");
  }

  let addresses;
  try {
    addresses = await dns.lookup(h, { all: true });
  } catch {
    throw new Error("unreachable");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address, a.family))) {
    throw new Error("unreachable");
  }
  return addresses;
}

/**
 * Everything that must be true of a URL before we connect to it. Runs on the
 * URL the customer gave us and again on every redirect target.
 */
export async function assertSafeUrl(u) {
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocol");
  if (!ALLOWED_PORTS.has(u.port)) throw new Error("port");
  if (u.username || u.password) throw new Error("credentials");
  await assertPublicHost(u.hostname);
}

/**
 * Fetches a customer-supplied URL, safely.
 *
 * Redirects are followed by hand so each hop can be validated before we
 * connect to it. `redirect: "manual"` is the whole point: with "follow", undici
 * chases the chain itself and the first public hostname is the only one anyone
 * ever checks.
 *
 * Known residual risk, stated rather than papered over: between resolving a
 * hostname here and undici resolving it again for the connection, a record with
 * a short TTL can change from a public address to a private one. Closing that
 * properly means pinning the checked address into the connection with a custom
 * dispatcher, which is a larger change than this one. The window is small and
 * requires an attacker-controlled authoritative nameserver.
 */
export async function safeFetch(url, { timeoutMs = 8000, capBytes = 400_000, maxRedirects = MAX_REDIRECTS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    let current = url instanceof URL ? url : normalizeUrl(url);
    await assertSafeUrl(current);

    for (let hop = 0; ; hop += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "MADBOTBot/1.0 (+https://getmadbot.com)" },
      });

      if (REDIRECT_CODES.has(res.status)) {
        // Drain nothing; we only want the header.
        res.body?.cancel?.().catch(() => {});
        const location = res.headers.get("location");
        if (!location) throw new Error("unreachable");
        if (hop >= maxRedirects) throw new Error("too_many_redirects");

        let next;
        try {
          next = new URL(location, current);
        } catch {
          throw new Error("unreachable");
        }
        // The check that was missing. Everything above exists to make this line
        // run on every hop rather than only the first.
        // eslint-disable-next-line no-await-in-loop
        await assertSafeUrl(next);
        current = next;
        continue;
      }

      const elapsedMs = Date.now() - startedAt;
      let body = "";
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;
          body += decoder.decode(value, { stream: true });
          received += value.length;
          // Checked after the read, not before, so the cap is a real ceiling
          // rather than one that could be overshot by a whole chunk.
          if (received >= capBytes) break;
        }
        reader.cancel().catch(() => {});
        return { ok: res.ok, status: res.status, finalUrl: current.toString(), body, bytes: received, elapsedMs };
      }

      body = (await res.text()).slice(0, capBytes);
      return { ok: res.ok, status: res.status, finalUrl: current.toString(), body, bytes: body.length, elapsedMs };
    }
  } finally {
    clearTimeout(timer);
  }
}
