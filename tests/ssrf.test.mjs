// End-to-end SSRF through the live public routes.
//
// The guard in lib/urlGuard.js only inspects the URL the customer typed.
// safeFetch (and /api/read-site's inline copy) then does the request with
// redirect:"follow" and re-checks nothing, so the server ends up connecting to
// whatever the *first* host redirects it to — including loopback and the
// private network the deployment sits in.
//
// The proof: a public redirector (httpbin.org, which passes the guard) 302s to
// a loopback server standing in for an internal service. If content from that
// server comes back in the API response, the hole is real and it also exfiltrates.
//
//   node --no-warnings tests/ssrf.test.mjs
// (needs `next dev` on http://localhost:3000)
import { suite, test, skipped, report } from "./_harness.mjs";
import { serveFixture, viaPublicRedirect, redirectorAvailable } from "./_fixture.mjs";

const BASE = process.env.MADBOT_BASE || "http://localhost:3000";
const CANARY = "SSRF-CANARY-8412";

suite("SSRF — redirect is not re-validated");

const internalPage =
  `<!doctype html><html lang="en"><head>` +
  `<title>${CANARY} internal admin console</title>` +
  `<meta name="description" content="Contents of an internal service that a customer-supplied URL must never be able to read.">` +
  `</head><body><h1>${CANARY}</h1>` +
  `<p>AWS_SECRET_ACCESS_KEY=would-be-here</p>` +
  `<a href="/admin/users">users</a><a href="/admin/keys">keys</a></body></html>`;

const routes = {
  "/": { body: internalPage },
  "/robots.txt": { status: 200, type: "text/plain", body: "User-agent: *\nDisallow:\n" },
  "/sitemap.xml": { status: 404, type: "text/plain", body: "" },
};

const haveRedirect = await redirectorAvailable();

async function probe(route, extract) {
  const fx = await serveFixture(routes);
  try {
    const hostile = viaPublicRedirect(fx.url("/"));
    const res = await fetch(`${BASE}${route}?url=${encodeURIComponent(hostile)}`, {
      headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* ignore */
    }
    return { status: res.status, body, json, extracted: json ? extract(json) : null, port: fx.port };
  } finally {
    await fx.close();
  }
}

if (!haveRedirect) {
  skipped("SSRF via redirect", "no public redirector reachable from this machine");
} else {
  await test("/api/audit does not follow a redirect into the private network", async () => {
    const r = await probe("/api/audit", (j) => ({ finalUrl: j.finalUrl, title: j.title, description: j.description, wordCount: j.stats?.wordCount }));
    if (r.body.includes(CANARY)) {
      throw new Error(
        `HIGH / SSRF. HTTP ${r.status}. A public unauthenticated endpoint fetched http://127.0.0.1:${r.port}/ ` +
          `and returned its contents to the caller: ${JSON.stringify(r.extracted)}. ` +
          `Input was https://httpbin.org/redirect-to?url=http://127.0.0.1:${r.port}/ — assertPublicHost only saw httpbin.org.`
      );
    }
    return `blocked (HTTP ${r.status}: ${JSON.stringify(r.json?.error || r.json?.finalUrl)})`;
  });

  await test("/api/snapshot does not follow a redirect into the private network", async () => {
    const r = await probe("/api/snapshot", (j) => ({ finalUrl: j.snapshot?.finalUrl, title: j.snapshot?.title, h1: j.snapshot?.h1, paths: j.snapshot?.paths }));
    if (r.body.includes(CANARY)) {
      throw new Error(
        `HIGH / SSRF. HTTP ${r.status}. Snapshot of an internal page returned to the caller, including its link ` +
          `structure: ${JSON.stringify(r.extracted)}. Repeated calls map an internal site over time.`
      );
    }
    return `blocked (HTTP ${r.status})`;
  });

  await test("/api/read-site does not follow a redirect into the private network", async () => {
    const r = await probe("/api/read-site", (j) => ({ title: j.title, description: j.description, faviconUrl: j.faviconUrl }));
    if (r.body.includes(CANARY)) {
      throw new Error(
        `HIGH / SSRF. HTTP ${r.status}. /api/read-site carries its own copy of the guard with the same gap: ` +
          `${JSON.stringify(r.extracted)}.`
      );
    }
    return `blocked (HTTP ${r.status})`;
  });

  await test("a redirect to a non-web port on loopback is refused", async () => {
    // Ports are unrestricted, so the redirect target can be any TCP port —
    // this is what turns "read an internal web page" into a port scanner.
    const fx = await serveFixture({ "/": { body: `<html><head><title>${CANARY} port ${"x"}</title></head><body>ok</body></html>` } });
    try {
      const hostile = viaPublicRedirect(`http://127.0.0.1:${fx.port}/`);
      const res = await fetch(`${BASE}/api/read-site?url=${encodeURIComponent(hostile)}`, { signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      if (body.includes(CANARY)) {
        throw new Error(
          `reached 127.0.0.1:${fx.port} — an arbitrary, non-80/443 TCP port. Response timing and error text separate ` +
            `open ports from closed ones, so this doubles as an internal port scanner.`
        );
      }
      return "refused";
    } finally {
      await fx.close();
    }
  });

  await test("the redirect target's /robots.txt and /sitemap.xml are not fetched from the internal host", async () => {
    // runAudit derives origin from finalUrl, so after the redirect it makes
    // two *more* requests against the internal host.
    const hits = [];
    const fx = await serveFixture(routes);
    try {
      // Re-wrap: record which paths the internal server is asked for.
      const probeRes = await fetch(
        `${BASE}/api/audit?url=${encodeURIComponent(viaPublicRedirect(fx.url("/")))}`,
        { headers: { "x-forwarded-for": "198.51.100.9" }, signal: AbortSignal.timeout(30_000) }
      );
      const j = await probeRes.json();
      // A robots.txt finding can only exist if the internal host was asked for it.
      const robotsFinding = (j.findings || []).find((f) => /robots\.txt/i.test(f.title));
      if (robotsFinding && String(j.finalUrl).includes("127.0.0.1")) {
        hits.push(robotsFinding.title);
      }
      if (hits.length) {
        throw new Error(
          `after the redirect, runAudit re-derived origin from finalUrl (${j.finalUrl}) and issued follow-up requests ` +
            `to the internal host: it reported "${hits.join(", ")}", which requires having fetched /robots.txt there. ` +
            `One customer-supplied URL becomes three internal requests.`
        );
      }
      return "no follow-up requests to the internal origin";
    } finally {
      await fx.close();
    }
  });
}

suite("SSRF — sitemap URLs from a remote robots.txt");

await test("crawlSite validates sitemap URLs before fetching them", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/crawler.js", import.meta.url), "utf8");
  const fn = src.match(/async function fetchSitemapUrls[\s\S]*?\n}/)?.[0] || "";
  const takesRemoteHints = /sitemapHints/.test(fn);
  // `origin` is only a parameter here; validation would mean an explicit
  // public-host assertion or a same-origin comparison on each candidate.
  const validates = /assertPublicHost|\.origin\s*!==|startsWith\(\s*origin/.test(fn);
  if (takesRemoteHints && !validates) {
    throw new Error(
      "HIGH / SSRF (second vector). fetchSitemapUrls() takes the `Sitemap:` values out of the target's own robots.txt " +
        "and the <loc> values out of a sitemap index, then hands them straight to safeFetch — no assertPublicHost, no " +
        "same-origin check. Any site a customer asks MADBOT to crawl can publish `Sitemap: http://169.254.169.254/latest/" +
        "meta-data/iam/security-credentials/` and have the server fetch it. Unlike the redirect vector this one needs no " +
        "redirector at all."
    );
  }
  return "validated";
});

report();
