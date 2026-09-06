// lib/audit.js — runAudit shape, invariants, threshold fidelity, degradation.
//   node --no-warnings --import ./tests/_register.mjs tests/audit.test.mjs
import { suite, test, skipped, eq, truthy, report, rejects } from "./_harness.mjs";
import { runAudit, runSnapshot } from "../lib/audit.js";
import { THRESHOLDS as T } from "../lib/auditClient.js";
import { serveFixture, viaPublicRedirect, redirectorAvailable, buildPage, chars, visibleWordCount } from "./_fixture.mjs";

suite("lib/audit.js — runAudit");

const SEVERITIES = new Set(["critical", "warning", "good"]);

function assertShape(r, label) {
  for (const k of ["ok", "score", "counts", "findings", "stats"]) {
    if (!(k in r)) throw new Error(`${label}: missing top-level key "${k}"`);
  }
  eq(r.ok, true, `${label}.ok`);
  if (!Array.isArray(r.findings)) throw new Error(`${label}.findings is not an array`);
  if (!r.stats || typeof r.stats !== "object") throw new Error(`${label}.stats is not an object`);

  if (typeof r.score !== "number" || !Number.isFinite(r.score)) throw new Error(`${label}.score is ${r.score}`);
  if (r.score < 5 || r.score > 100) throw new Error(`${label}.score out of the documented 5..100 range: ${r.score}`);

  r.findings.forEach((f, i) => {
    if (!SEVERITIES.has(f.severity)) throw new Error(`${label}.findings[${i}].severity = ${JSON.stringify(f.severity)}`);
    if (!f.area) throw new Error(`${label}.findings[${i}] has no area`);
    if (!f.title) throw new Error(`${label}.findings[${i}] has no title`);
    if (f.severity !== "good" && !f.fix) {
      throw new Error(`${label}.findings[${i}] (${f.severity} "${f.title}") has no fix`);
    }
    if ("weight" in f) throw new Error(`${label}.findings[${i}] leaks the internal weight field`);
  });

  const actual = {
    critical: r.findings.filter((f) => f.severity === "critical").length,
    warning: r.findings.filter((f) => f.severity === "warning").length,
    good: r.findings.filter((f) => f.severity === "good").length,
  };
  for (const k of ["critical", "warning", "good"]) {
    if (r.counts[k] !== actual[k]) {
      throw new Error(`${label}.counts.${k} = ${r.counts[k]} but findings contain ${actual[k]}`);
    }
  }
  if (actual.critical + actual.warning + actual.good !== r.findings.length) {
    throw new Error(`${label}: findings contain a severity outside critical/warning/good`);
  }
}

// ---------------------------------------------------------------------------
// 1. Three genuinely different real sites.
// ---------------------------------------------------------------------------
const REAL = [
  ["https://example.com/", "IANA placeholder — near-empty page"],
  ["https://www.iana.org/", "small real institutional site"],
  ["https://stripe.com/", "large marketing site"],
];

const realResults = {};
for (const [url, why] of REAL) {
  await test(`runAudit(${url}) — ${why}`, async () => {
    const r = await runAudit(url);
    assertShape(r, url);
    realResults[url] = r;
    return `score ${r.score}, ${r.counts.critical}C/${r.counts.warning}W/${r.counts.good}G, ${r.stats.wordCount} words, ${r.stats.responseMs}ms`;
  });
}

await test("the three real sites produce genuinely different findings", async () => {
  const got = Object.entries(realResults);
  if (got.length < 2) throw new Error("fewer than two real audits succeeded, nothing to compare");
  const sigs = got.map(([u, r]) => [u, r.findings.map((f) => f.title).sort().join("|")]);
  const uniq = new Set(sigs.map(([, s]) => s));
  if (uniq.size !== sigs.length) throw new Error("two different sites produced an identical finding set");
  const scores = got.map(([, r]) => r.score);
  return `scores ${scores.join(" / ")}, distinct finding sets: ${uniq.size}`;
});

await test("example.com (thin, no schema, no OG) is scored worse than a full marketing site", async () => {
  const a = realResults["https://example.com/"];
  const b = realResults["https://stripe.com/"];
  if (!a || !b) throw new Error("need both example.com and stripe.com results");
  if (!(a.score < b.score)) throw new Error(`example.com scored ${a.score}, stripe.com scored ${b.score}`);
  return `${a.score} < ${b.score}`;
});

// ---------------------------------------------------------------------------
// 2. THRESHOLDS fidelity. lib/auditClient.js says the report UI draws its
//    gauges against these exact numbers, so the boundary the audit applies has
//    to be the same number, not one near it.
// ---------------------------------------------------------------------------
const haveRedirect = await redirectorAvailable();

/** Audit an exact byte-for-byte page by routing a public redirect at it. */
async function auditFixture(routes, path = "/") {
  const fx = await serveFixture(routes);
  try {
    const r = await runAudit(viaPublicRedirect(fx.url(path)));
    return { r, fx };
  } finally {
    await fx.close();
  }
}

const titles = (r) => r.findings.map((f) => f.title);
const has = (r, re) => r.findings.some((f) => re.test(f.title));

if (!haveRedirect) {
  skipped("THRESHOLDS boundary fixtures", "no public redirector reachable to serve a controlled page to a guard that requires a public host");
} else {
  // (a) Everything sitting exactly ON the good side of each boundary.
  await test("THRESHOLDS: values exactly at the boundary are treated as acceptable", async () => {
    const html = buildPage({
      title: chars(T.titleMax), // 65
      description: chars(T.descriptionMax), // 170
      words: T.wordsWarning, // 400
      links: ["/a", "/b", "/c", "/d"], // distinctPages === pagesLinked (4)
      images: 4,
      imagesWithAlt: 2, // exactly altMissingPct (50%)
      scripts: T.scripts, // 25
      schema: "FAQPage",
    });
    const { r } = await auditFixture({
      "/": { body: html },
      "/robots.txt": { status: 200, type: "text/plain", body: "User-agent: *\nDisallow: /nothing\nSitemap: /sitemap.xml\n" },
      "/sitemap.xml": { status: 200, type: "application/xml", body: "<urlset><url><loc>/a</loc></url></urlset>" },
    });
    assertShape(r, "boundary-at");
    eq(r.stats.wordCount, T.wordsWarning, "measured wordCount");
    eq(r.stats.scripts, T.scripts, "measured script count");
    eq(r.stats.distinctPages, T.pagesLinked, "measured distinctPages");

    const problems = [];
    if (has(r, /^Title is /)) problems.push(`title of exactly ${T.titleMax} chars flagged (titleMax=${T.titleMax})`);
    if (has(r, /^Meta description is /)) problems.push(`description of exactly ${T.descriptionMax} chars flagged (descriptionMax=${T.descriptionMax})`);
    if (has(r, /words on the homepage|words of text/)) problems.push(`${T.wordsWarning} words flagged (wordsWarning=${T.wordsWarning})`);
    if (has(r, /script tags on one page/)) problems.push(`${T.scripts} scripts flagged (scripts=${T.scripts})`);
    if (has(r, /other page(s)? linked from here/)) problems.push(`${T.pagesLinked} linked pages flagged (pagesLinked=${T.pagesLinked})`);
    const alt = r.findings.find((f) => /images have no alt text/.test(f.title));
    if (alt && alt.severity !== "warning") problems.push(`exactly ${T.altMissingPct}% missing alt is "${alt.severity}", expected "warning" (altMissingPct=${T.altMissingPct} uses >)`);
    if (problems.length) throw new Error(problems.join("; "));
    return `all boundaries clean at the documented numbers`;
  });

  // (b) One step past every boundary.
  await test("THRESHOLDS: one step past each boundary trips exactly the documented finding", async () => {
    const html = buildPage({
      title: chars(T.titleMax + 1), // 66
      description: chars(T.descriptionMax + 1), // 171
      words: T.wordsWarning - 1, // 399
      links: ["/a", "/b", "/c"], // 3 < pagesLinked
      images: 4,
      imagesWithAlt: 1, // 75% missing > altMissingPct
      scripts: T.scripts + 1, // 26
      schema: "FAQPage",
    });
    const { r } = await auditFixture({
      "/": { body: html },
      "/robots.txt": { status: 404, type: "text/plain", body: "nope" },
      "/sitemap.xml": { status: 404, type: "text/plain", body: "nope" },
    });
    assertShape(r, "boundary-over");
    eq(r.stats.wordCount, T.wordsWarning - 1, "measured wordCount");

    const missing = [];
    const t = titles(r);
    if (!t.includes(`Title is ${T.titleMax + 1} characters`)) missing.push(`no "Title is ${T.titleMax + 1} characters" (got ${JSON.stringify(t.filter((x) => /Title/.test(x)))})`);
    if (!t.includes(`Meta description is ${T.descriptionMax + 1} characters`)) missing.push(`no over-long description finding (got ${JSON.stringify(t.filter((x) => /description/i.test(x)))})`);
    if (!t.includes(`~${T.wordsWarning - 1} words on the homepage`)) missing.push(`no thin-content warning at ${T.wordsWarning - 1} words`);
    if (!t.includes(`${T.scripts + 1} script tags on one page`)) missing.push(`no script-count warning at ${T.scripts + 1}`);
    if (!has(r, /Only 3 other pages linked from here/)) missing.push(`no internal-linking warning at 3 pages`);
    const alt = r.findings.find((f) => /images have no alt text/.test(f.title));
    if (!alt) missing.push("no alt-text finding at 75% missing");
    else if (alt.severity !== "critical") missing.push(`75% missing alt is "${alt.severity}", expected "critical"`);
    // robots.txt / sitemap.xml both 404 here.
    if (!t.includes("No robots.txt")) missing.push("404 robots.txt did not produce the 'No robots.txt' warning");
    if (!t.includes("No sitemap.xml found")) missing.push("404 sitemap.xml did not produce the 'No sitemap.xml found' warning");
    if (missing.length) throw new Error(missing.join("; "));
    return "every over-boundary finding present with the right severity";
  });

  // (c) The low side of each boundary, plus the score floor.
  await test("THRESHOLDS: under-length title/description and the 5-point score floor", async () => {
    const html = buildPage({
      title: chars(T.titleMin - 1), // 19
      description: chars(T.descriptionMin - 1), // 69
      words: T.wordsCritical - 1, // 149
      links: [],
      anchors: 3, // triggers the single-page-site critical
      images: 2,
      imagesWithAlt: 0,
      scripts: 0,
      schema: null,
      viewport: false,
      lang: false,
      canonical: false,
      og: false,
      h1: 0,
    });
    const { r } = await auditFixture({
      "/": { body: html },
      // Only BadBot is blocked here. A correct parser must NOT call this a
      // site-wide block.
      "/robots.txt": {
        status: 200,
        type: "text/plain",
        body: "User-agent: *\nDisallow: /admin\n\nUser-agent: BadBot\nDisallow: /\n",
      },
      "/sitemap.xml": { status: 404, type: "text/plain", body: "nope" },
    });
    assertShape(r, "boundary-under");
    eq(r.stats.wordCount, T.wordsCritical - 1, "measured wordCount");
    const t = titles(r);
    const missing = [];
    if (!t.includes(`Title is only ${T.titleMin - 1} characters`)) missing.push(`no short-title warning at ${T.titleMin - 1} chars`);
    if (!t.includes(`Meta description is only ${T.descriptionMin - 1} characters`)) missing.push(`no short-description warning at ${T.descriptionMin - 1} chars`);
    if (!t.includes(`Only ~${T.wordsCritical - 1} words of text on the homepage`)) missing.push(`${T.wordsCritical - 1} words did not trip the wordsCritical branch`);
    if (!t.includes("Everything lives on one page")) missing.push("0 linked pages + 3 anchors did not trip the single-page critical");
    eq(r.score, 5, "score floor with a page this bad");
    if (missing.length) throw new Error(missing.join("; "));
    return `score floored at 5, ${r.counts.critical} criticals`;
  });

  await test("robots.txt that only blocks a named bot is NOT reported as blocking all crawlers", async () => {
    const html = buildPage({ title: chars(40), description: chars(120), words: 500, links: ["/a", "/b", "/c", "/d"], schema: "Organization" });
    const { r } = await auditFixture({
      "/": { body: html },
      "/robots.txt": {
        status: 200,
        type: "text/plain",
        body: "User-agent: *\nDisallow: /admin\n\nUser-agent: BadBot\nDisallow: /\n",
      },
      "/sitemap.xml": { status: 200, type: "application/xml", body: "<urlset><url><loc>/a</loc></url></urlset>" },
    });
    const hit = r.findings.find((f) => f.title === "robots.txt blocks all crawlers");
    if (hit) {
      throw new Error(
        `runAudit reported "${hit.title}" (critical, 20-point penalty, score ${r.score}) for a robots.txt that only ` +
          `disallows BadBot. The detector is /user-agent\\s*:\\s*\\*[\\s\\S]*?disallow\\s*:\\s*\\/\\s*(\\n|$)/i — the lazy ` +
          `[\\s\\S]*? walks past the "*" group into any later group's "Disallow: /".`
      );
    }
    return `correctly not flagged (score ${r.score})`;
  });

  await test("degrades on a very large page (caps at safeFetch's 400KB, no throw)", async () => {
    const filler = Array.from({ length: 400_000 }, (_, i) => `w${i}`).join(" ");
    const html = `<!doctype html><html lang="en"><head><title>${chars(40)}</title></head><body><h1>Big</h1><p>${filler}</p></body></html>`;
    const { r } = await auditFixture({
      "/": { body: html },
      "/robots.txt": { status: 404, type: "text/plain", body: "" },
      "/sitemap.xml": { status: 404, type: "text/plain", body: "" },
    });
    assertShape(r, "huge-page");
    if (r.stats.htmlKb > 600) throw new Error(`read ${r.stats.htmlKb}KB from a ${Math.round(html.length / 1024)}KB page — cap not applied`);
    return `${Math.round(html.length / 1024)}KB page truncated to ${r.stats.htmlKb}KB, ${r.stats.wordCount} words counted`;
  });
}

// ---------------------------------------------------------------------------
// 3. Degradation on hostile / broken targets.
// ---------------------------------------------------------------------------
await test("404 page degrades to a typed error rather than an unhandled throw", async () => {
  let r;
  try {
    r = await runAudit("https://example.com/this-path-does-not-exist-9182734");
  } catch (err) {
    if (err.code !== "bad_status") {
      throw new Error(`threw ${err.name}: ${err.message} — no err.code, so /api/audit's handler falls through to its generic branch`);
    }
    return `throws a typed error {code:"bad_status", status:${err.status}} — callers must catch, it does not return ok:false`;
  }
  return `returned ok=${r.ok} score=${r.score}`;
});

await test("a domain that does not resolve degrades without an unhandled throw", async () => {
  const err = await rejects(() => runAudit("https://no-such-host-madbot-test-91827.example/"));
  const msg = String(err.message);
  if (/ENOTFOUND|EAI_AGAIN|unreachable/.test(msg) || err.code === "ENOTFOUND") {
    return `rejects with ${err.code || err.name}: ${msg.slice(0, 60)}`;
  }
  throw new Error(`unexpected error for NXDOMAIN: ${err.name}: ${msg}`);
});

await test("NXDOMAIN error message is one /api/audit maps to a 400", async () => {
  // The route only maps message==="unreachable" (and TypeError) to a 400.
  const err = await rejects(() => runAudit("https://no-such-host-madbot-test-91827.example/"));
  const msg = String(err.message);
  if (msg !== "unreachable" && !(err instanceof TypeError)) {
    throw new Error(
      `assertPublicHost lets the raw DNS error escape ("${msg.slice(0, 60)}"). /api/audit checks for the literal ` +
        `string "unreachable", so a typo'd domain returns HTTP 200 {ok:false,"Couldn't reach that site"} instead of a 400.`
    );
  }
  return "mapped to 400";
});

await test("several redirects are followed and the final URL is reported", async () => {
  const r = await runAudit("http://en.wikipedia.org/wiki/HTTP_301");
  assertShape(r, "redirect-chain");
  if (r.finalUrl === r.url) throw new Error(`finalUrl (${r.finalUrl}) did not change across an http->https redirect`);
  if (!/^https:/.test(r.finalUrl)) throw new Error(`finalUrl is not https after the redirect chain: ${r.finalUrl}`);
  const httpsFinding = r.findings.find((f) => f.title === "Not served over HTTPS");
  if (httpsFinding) throw new Error("scored the http:// input as insecure even though it redirected to https");
  return `${r.url} -> ${r.finalUrl}`;
});

await test("runAudit is deterministic for the same page (two runs agree on findings)", async () => {
  const a = await runAudit("https://example.com/");
  const b = await runAudit("https://example.com/");
  const ta = a.findings.map((f) => f.title).filter((x) => !/Responded in/.test(x)).join("|");
  const tb = b.findings.map((f) => f.title).filter((x) => !/Responded in/.test(x)).join("|");
  eq(ta, tb, "finding titles across two runs");
  return `${a.findings.length} findings, stable`;
});

// ---------------------------------------------------------------------------
// 4. runSnapshot, used by the diff.
// ---------------------------------------------------------------------------
await test("runSnapshot returns the fields diffSnapshots reads", async () => {
  const s = await runSnapshot("https://www.iana.org/");
  for (const k of ["url", "finalUrl", "title", "description", "wordCount", "schemaTypes", "h1", "paths", "htmlKb", "responseMs"]) {
    if (!(k in s)) throw new Error(`missing snapshot key "${k}"`);
  }
  if (!Array.isArray(s.paths)) throw new Error("paths is not an array");
  if (!Array.isArray(s.schemaTypes)) throw new Error("schemaTypes is not an array");
  return `${s.wordCount} words, ${s.paths.length} paths`;
});

report();
