// Serving a controlled page to code that insists on a *public* hostname.
//
// runAudit/runSnapshot call assertPublicHost() before fetching, so a plain
// http://127.0.0.1 fixture can't be used. The only way to hand them a page
// whose exact byte content we control is to go through a public host that
// redirects inward — which is itself the SSRF finding these tests report.
// Every helper here therefore degrades to "skip" if the redirect stops
// working, so the suite still runs once the hole is closed.

import http from "node:http";

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
export function buildPage({ title, description, words, links = [], anchors = 0, images = 0, imagesWithAlt = 0, scripts = 0, schema = null, viewport = true, lang = true, canonical = true, og = true, h1 = 1 }) {
  const head = [
    title === null ? "" : `<title>${title}</title>`,
    description === null ? "" : `<meta name="description" content="${description}">`,
    viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : "",
    canonical ? '<link rel="canonical" href="/">' : "",
    og ? '<meta property="og:title" content="og t"><meta property="og:description" content="og d"><meta property="og:image" content="/i.png">' : "",
    '<link rel="icon" href="/favicon.ico">',
    schema ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${schema}"}</script>` : "",
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
