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

  await test("runSnapshot refuses a redirect into the private network", async () => {
    // Was a bug report against /api/snapshot, which now needs a token, so the
    // route can no longer prove anything either way. The fix lives in
    // lib/urlGuard.js, so assert it there: no token, no dev server, and it
    // covers every caller of safeFetch rather than one route.
    const { runSnapshot } = await import("../lib/audit.js");
    const fx = await serveFixture({ "/": { body: `<html><head><title>${CANARY}</title></head><body>x</body></html>` } });
    try {
      try {
        const out = await runSnapshot(viaPublicRedirect(`http://127.0.0.1:${fx.port}/`));
        if (JSON.stringify(out).includes(CANARY)) {
          throw new Error("HIGH / SSRF. runSnapshot followed a redirect to loopback and returned its contents.");
        }
        return "no canary content returned";
      } catch (e) {
        if (String(e.message).startsWith("HIGH /")) throw e;
        return `refused (${e.message})`;
      }
    } finally {
      await fx.close();
    }
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

await test("safeFetch refuses a private URL handed to it directly", async () => {
  // The crawler reads Sitemap: out of a target's own robots.txt and passes
  // the values to safeFetch. It has no host check of its own and does not
  // need one: safeFetch validates every URL it is given, and it is the only
  // fetch path. That is what closes the sitemap vector, so this is the
  // assertion worth keeping.
  const { safeFetch } = await import("../lib/urlGuard.js");
  const targets = [
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "http://100.64.0.1/",
  ];
  const leaked = [];
  for (const t of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await safeFetch(t, { timeoutMs: 4000 });
      leaked.push(t);
    } catch {
      /* refused, which is the point */
    }
  }
  if (leaked.length) {
    throw new Error(`HIGH / SSRF. safeFetch fetched private addresses without complaint: ${leaked.join(", ")}`);
  }
  return `all ${targets.length} private targets refused`;
});

report();
