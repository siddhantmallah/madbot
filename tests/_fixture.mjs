// Handing controlled bytes to code that insists on a public host.
//
// runAudit and runSnapshot call assertPublicHost() before fetching, and
// safeFetch re-validates every redirect hop, so there is no URL a loopback
// server can be reached at: 127.0.0.1 is a private address and its port is not
// 80 or 443. Both refusals are correct and neither should be relaxed to make a
// test pass.
//
// There are therefore two strategies here, for two different jobs.
//
//   installFixtureHost() — for testing what the audit CONCLUDES. It replaces
//   DNS and fetch for one reserved hostname, so the guards run in full and
//   pass, and the bytes come from the test. Hermetic: no server, no sockets,
//   no network.
//
//   serveFixture() + viaPublicRedirect() — for testing what the guard
//   REFUSES. The SSRF suite needs a real public host redirecting to a real
//   loopback server, because the finding being regression-tested is that the
//   redirect target goes unchecked. Those helpers must keep talking to the
//   network, and they degrade to "skip" when the redirector is unreachable.

import http from "node:http";
import dns from "node:dns/promises";

// --- hermetic fixture host ------------------------------------------------

// RFC 2606 reserves .test, so this can never collide with a real domain, and
// it is not one of the suffixes assertPublicHost refuses outright.
const FIXTURE_HOST = "fixture.madbot.test";

// TEST-NET-3, RFC 5737. Deliberately a documentation range: public as far as
// the guard's private-range checks are concerned, and routable nowhere, so a
// patch that leaks cannot reach anything.
const FIXTURE_ADDRESS = "203.0.113.7";

/**
 * Builds a Response that arrives in chunks, the way a socket delivers one.
 *
 * This matters for the byte-cap test. `new Response(string)` hands its whole
 * body over in a single read, so safeFetch's cap — which is checked after each
 * chunk — would never engage and the test would prove nothing. Chunking makes
 * the fixture behave like the transport it stands in for.
 */
function chunkedResponse(route, chunkBytes) {
  const bytes = new TextEncoder().encode(route.body ?? "");
  const headers = { "content-type": route.type || "text/html; charset=utf-8", ...(route.headers || {}) };
  if (!bytes.length) return new Response(null, { status: route.status ?? 200, headers });

  let at = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(at, at + chunkBytes));
      at += chunkBytes;
      return undefined;
    },
  });
  return new Response(stream, { status: route.status ?? 200, headers });
}

/**
 * Serves `routes` at a hostname the guards accept, by replacing DNS resolution
 * and fetch for that one host and passing everything else through.
 *
 * `routes` maps a pathname to { status, type, body, headers }. Anything not
 * listed answers 404, which is also what makes the audit's 404 probe see a
 * correctly configured site.
 *
 * The http:// origin answers a 301 to https://, so the audit's http-to-https
 * probe reads as an ordinary well-configured host rather than one serving both
 * schemes. A test that wants the opposite passes `redirectToHttps: false`.
 *
 * Every suite runs in its own child process (see run-all.mjs), and restore()
 * puts both globals back, so the patch cannot reach another suite or the
 * real-site cases in this one.
 */
export function installFixtureHost(routes, { redirectToHttps = true, chunkBytes = 65_536 } = {}) {
  const realFetch = globalThis.fetch;
  const realLookup = dns.lookup;

  dns.lookup = async (hostname, options) => {
    if (String(hostname).toLowerCase() === FIXTURE_HOST) {
      return [{ address: FIXTURE_ADDRESS, family: 4 }];
    }
    return realLookup(hostname, options);
  };

  globalThis.fetch = async (input, init) => {
    let u;
    try {
      u = new URL(input instanceof URL ? input : String(input));
    } catch {
      return realFetch(input, init);
    }
    if (u.hostname.toLowerCase() !== FIXTURE_HOST) return realFetch(input, init);

    if (u.protocol === "http:" && redirectToHttps) {
      return new Response(null, {
        status: 301,
        headers: { location: `https://${FIXTURE_HOST}${u.pathname}` },
      });
    }

    const route = routes[u.pathname];
    if (!route) {
      return chunkedResponse(
        { status: 404, body: "<!doctype html><html><head><title>Not found</title></head><body>404</body></html>" },
        chunkBytes
      );
    }
    return chunkedResponse(route, chunkBytes);
  };

  return {
    host: FIXTURE_HOST,
    origin: `https://${FIXTURE_HOST}`,
    url: (p = "/") => `https://${FIXTURE_HOST}${p}`,
    restore() {
      globalThis.fetch = realFetch;
      dns.lookup = realLookup;
    },
  };
}

/** installFixtureHost, run a body against it, and always put the globals back. */
export async function withFixtureHost(routes, fn, options) {
  const fx = installFixtureHost(routes, options);
  try {
    return await fn(fx);
  } finally {
    fx.restore();
  }
}

// --- real network, for the SSRF suite only --------------------------------

export const REDIRECTOR = "https://httpbin.org/redirect-to";

let redirectorUp = null;

export async function redirectorAvailable() {
  if (redirectorUp !== null) return redirectorUp;
  try {
    const res = await fetch(`${REDIRECTOR}?url=${encodeURIComponent("http://example.com/")}&status_code=302`, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    redirectorUp = res.status === 302 || res.status === 301;
  } catch {
    redirectorUp = false;
  }
  return redirectorUp;
}

/**
 * Start a loopback server from a { path: {status, type, body} } map.
 * Returns { port, origin, url(path), close() }.
 */
export async function serveFixture(routes) {
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    const r = routes[path];
    if (!r) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html><head><title>Not found</title></head><body>404</body></html>");
      return;
    }
    res.writeHead(r.status || 200, { "content-type": r.type || "text/html; charset=utf-8" });
    res.end(r.body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    url: (p = "/") => `http://127.0.0.1:${port}${p}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** A public URL that 302s to `target`. Handed to code under test as the input. */
export function viaPublicRedirect(target) {
  return `${REDIRECTOR}?url=${encodeURIComponent(target)}&status_code=302`;
}

// --- page building -------------------------------------------------------

/** Same visible-word count the audit uses, so fixtures can hit a boundary exactly. */
export function visibleWordCount(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length : 0;
}

export function chars(n, word = "boundary") {
  // Deterministic text of exactly n characters.
  let s = "";
  while (s.length < n) s += (s ? " " : "") + word;
  return s.slice(0, n).replace(/\s$/, "x");
}

/**
 * Build a page whose measured word count is exactly `words`, with the given
 * title/description/link/image/script counts.
 */
export function buildPage({ title, description, words, links = [], anchors = 0, images = 0, imagesWithAlt = 0, scripts = 0, schema = null, viewport = true, lang = true, canonical = true, og = true, h1 = 1, extraHead = "" }) {
  const head = [
    title === null ? "" : `<title>${title}</title>`,
    description === null ? "" : `<meta name="description" content="${description}">`,
    viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : "",
    canonical ? '<link rel="canonical" href="/">' : "",
    og ? '<meta property="og:title" content="og t"><meta property="og:description" content="og d"><meta property="og:image" content="/i.png">' : "",
    '<link rel="icon" href="/favicon.ico">',
    schema ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${schema}"}</script>` : "",
    extraHead,
  ].join("");

  // ld+json counts as a <script tag too.
  const extraScripts = Math.max(0, scripts - (schema ? 1 : 0));
  const scriptTags = Array.from({ length: extraScripts }, (_, i) => `<script>var s${i}=1;</script>`).join("");
  const imgTags =
    Array.from({ length: imagesWithAlt }, (_, i) => `<img src="/a${i}.png" alt="described image ${i}">`).join("") +
    Array.from({ length: Math.max(0, images - imagesWithAlt) }, (_, i) => `<img src="/n${i}.png">`).join("");
  // Link text is a word, so keep it a single token and account for it.
  const linkTags = links.map((p, i) => `<a href="${p}">L${i}</a>`).join("");
  const anchorTags = Array.from({ length: anchors }, (_, i) => `<a href="#s${i}">A${i}</a>`).join("");
  const h1Tags = Array.from({ length: h1 }, (_, i) => `<h1>H${i}</h1>`).join("");

  const shell = (filler) =>
    `<!doctype html><html${lang ? ' lang="en"' : ""}><head>${head}</head><body>${h1Tags}${linkTags}${anchorTags}${imgTags}${scriptTags}<p>${filler}</p></body></html>`;

  // Binary-search the filler length so the measured count lands exactly.
  let lo = 0;
  let hi = Math.max(10, words * 2 + 40);
  let best = shell("");
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const html = shell(Array.from({ length: mid }, (_, i) => `w${i}`).join(" "));
    const c = visibleWordCount(html);
    if (c === words) return html;
    if (c < words) {
      lo = mid + 1;
      best = html;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
