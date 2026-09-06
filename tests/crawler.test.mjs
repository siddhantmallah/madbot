// lib/crawler.js — robots.txt compliance, page cap, origin confinement, loops.
//   node --no-warnings --import ./tests/_register.mjs tests/crawler.test.mjs
import { readFileSync } from "node:fs";
import { suite, test, eq, truthy, report } from "./_harness.mjs";
import { crawlSite } from "../lib/crawler.js";

suite("lib/crawler.js — crawlSite");

const SRC = readFileSync(new URL("../lib/crawler.js", import.meta.url), "utf8");

/** Pull the Disallow prefixes that apply to "*" out of a real robots.txt. */
function disallowsForStar(body) {
  const out = [];
  let applies = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*" || /madbot/i.test(value);
    else if (key === "disallow" && applies && value) out.push(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. robots.txt Disallow is genuinely honoured — proven by a path that the
//    crawler was explicitly handed and had to refuse.
//    httpbin.org/robots.txt is "User-agent: *\nDisallow: /deny", and
//    https://httpbin.org/deny answers 200, so a crawler that ignored the rule
//    would have it in `pages`.
// ---------------------------------------------------------------------------
let httpbin;
await test("honours Disallow: refuses the start URL httpbin.org/deny", async () => {
  httpbin = await crawlSite("https://httpbin.org/deny", { maxPages: 3, maxDepth: 1, budgetMs: 45_000 });
  eq(httpbin.robots.exists, true, "robots.txt found");
  eq(httpbin.robots.blocksAll, false, "blocksAll");
  eq(httpbin.robots.disallowCount, 1, "parsed Disallow rule count");
  const denied = httpbin.pages.filter((p) => p.path.startsWith("/deny"));
  if (denied.length) throw new Error(`crawled a disallowed path: ${denied.map((p) => p.url).join(", ")}`);
  const errored = (httpbin.errors || []).filter((e) => /\/deny/.test(e.url));
  if (errored.length) throw new Error(`/deny was fetched (and errored) rather than skipped before the request: ${JSON.stringify(errored)}`);
  return `${httpbin.pages.length} pages crawled, /deny never requested`;
});

await test("a disallowed start URL is dropped silently, not surfaced to the caller", async () => {
  // Recorded as a behaviour note: the user asked for /deny and got a crawl of
  // other pages with no signal that their own URL was excluded.
  truthy(httpbin, "previous crawl ran");
  if (httpbin.blockedByRobots !== false) return "reported via blockedByRobots";
  const flagged = JSON.stringify(httpbin).includes("/deny");
  if (!flagged) {
    throw new Error(
      "the start URL was excluded by robots.txt but the result says blockedByRobots:false and mentions /deny nowhere — " +
        "the caller cannot tell the difference between 'crawled your page' and 'silently crawled something else'"
    );
  }
  return "mentioned in the result";
});

// ---------------------------------------------------------------------------
// 2. A real multi-rule robots.txt, parsed with correct user-agent grouping.
// ---------------------------------------------------------------------------
let stripe;
let stripeRules = [];
await test("parses a real multi-group robots.txt and scopes rules to the right agent", async () => {
  const robotsBody = await fetch("https://stripe.com/robots.txt", {
    headers: { "User-Agent": "MADBOTBot/1.0 (+https://getmadbot.com)" },
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.text());
  stripeRules = disallowsForStar(robotsBody);

  stripe = await crawlSite("https://stripe.com/", { maxPages: 4, maxDepth: 1, budgetMs: 90_000 });
  eq(stripe.robots.exists, true, "robots.txt found");
  eq(stripe.robots.blocksAll, false, "blocksAll");
  eq(stripe.robots.disallowCount, stripeRules.length, `Disallow rules for "*" (expected ${stripeRules.length})`);
  // stripe.com's ia_archiver group disallows /docs; the "*" group allows it.
  if (stripe.robots.disallowCount && stripeRules.includes("/docs")) {
    throw new Error('picked up the ia_archiver group\'s "Disallow: /docs" — user-agent grouping is wrong');
  }
  truthy(stripe.robots.sitemaps.length, "Sitemap: directive parsed");
  return `${stripe.robots.disallowCount} rules, ${stripe.robots.sitemaps.length} sitemap hint(s), ${stripe.pages.length} pages`;
});

await test("no crawled page matches any Disallow prefix", async () => {
  truthy(stripe, "crawl ran");
  const bad = stripe.pages.filter((p) => stripeRules.some((r) => p.path.startsWith(r)));
  if (bad.length) throw new Error(`crawled disallowed paths: ${bad.map((p) => p.path).join(", ")}`);
  return `${stripe.pages.length} pages, all allowed`;
});

await test("isDisallowed understands robots.txt wildcards (* and $)", async () => {
  // startsWith() can never match a pattern that contains "*" or ends "$", so
  // rules like "Disallow: /*?" or "Disallow: /*.pdf$" are silently inert.
  const fn = SRC.match(/function isDisallowed[\s\S]*?\n}/)?.[0] || "";
  if (!/[*]|replace|RegExp/.test(fn.replace("startsWith", ""))) {
    throw new Error(
      `isDisallowed is a bare prefix match: ${fn.replace(/\s+/g, " ").trim()} — any Disallow containing "*" or ` +
        `ending "$" (very common) is counted in disallowCount but never actually blocks anything`
    );
  }
  return "wildcards handled";
});

// ---------------------------------------------------------------------------
// 3. Bounds: page cap, origin confinement, termination.
// ---------------------------------------------------------------------------
await test("respects maxPages", async () => {
  const r = await crawlSite("https://www.iana.org/", { maxPages: 3, maxDepth: 2, budgetMs: 45_000 });
  if (r.pages.length > 3) throw new Error(`maxPages=3 but crawled ${r.pages.length}`);
  eq(r.stats.pagesCrawled, r.pages.length, "stats.pagesCrawled");
  return `${r.pages.length} pages (cap 3)`;
});

let iana;
await test("never leaves the origin", async () => {
  iana = await crawlSite("https://www.iana.org/", { maxPages: 6, maxDepth: 2, budgetMs: 60_000 });
  const off = iana.pages.filter((p) => {
    try {
      return new URL(p.url).origin !== iana.origin;
    } catch {
      return true;
    }
  });
  if (off.length) throw new Error(`crawled off-origin: ${off.map((p) => p.url).join(", ")}`);
  return `${iana.pages.length} pages, all on ${iana.origin}`;
});

await test("does not fetch the same URL twice (self-referential links terminate)", async () => {
  truthy(iana, "crawl ran");
  const urls = iana.pages.map((p) => p.url);
  const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dupes.length) throw new Error(`fetched duplicates: ${[...new Set(dupes)].join(", ")}`);
  if (iana.stats.elapsedMs >= 60_000) throw new Error(`crawl used the whole ${iana.stats.elapsedMs}ms budget — likely looping`);
  return `${urls.length} unique URLs in ${iana.stats.elapsedMs}ms`;
});

await test("maxDepth is enforced", async () => {
  truthy(iana, "crawl ran");
  const tooDeep = iana.pages.filter((p) => p.depth > 2);
  if (tooDeep.length) throw new Error(`pages beyond maxDepth=2: ${tooDeep.map((p) => `${p.path}@${p.depth}`).join(", ")}`);
  return `max depth seen: ${Math.max(...iana.pages.map((p) => p.depth))}`;
});

await test("crawl result has the documented stats keys", async () => {
  truthy(iana, "crawl ran");
  for (const k of ["pagesCrawled", "discovered", "totalWords", "avgWords", "pagesWithSchema", "schemaTypes", "avgResponseMs", "orphanPages", "brokenLinks", "singlePageSite", "elapsedMs"]) {
    if (!(k in iana.stats)) throw new Error(`missing stats.${k}`);
  }
  if (iana.stats.discovered < 0) throw new Error(`stats.discovered is negative (${iana.stats.discovered}) — seen.size minus absentPaths can underflow`);
  return `discovered ${iana.stats.discovered}, crawled ${iana.stats.pagesCrawled}`;
});

// ---------------------------------------------------------------------------
// 4. Orphan detection. page.outLinks is deleted inside the crawl loop, before
//    the orphan pass reads it.
// ---------------------------------------------------------------------------
await test("orphanPages is not just 'every page except the homepage'", async () => {
  truthy(iana, "crawl ran");
  const deep = iana.pages.filter((p) => p.depth > 0);
  if (deep.length < 2) throw new Error(`only ${deep.length} non-homepage pages crawled, cannot judge`);
  if (iana.stats.orphanPages.length === deep.length) {
    throw new Error(
      `all ${deep.length} non-homepage pages reported as orphans (${iana.stats.orphanPages.slice(0, 5).join(", ")}...). ` +
        `crawlSite does "page.outLinks.forEach(...); delete page.outLinks" inside the loop, then the orphan pass does ` +
        `"pages.forEach(p => (p.outLinks || [])...)" — so linkedTo is always empty and every depth>0 page is an orphan.`
    );
  }
  return `${iana.stats.orphanPages.length} of ${deep.length} non-homepage pages flagged`;
});

// ---------------------------------------------------------------------------
// 5. Sitemap URLs from a remote robots.txt are fetched with no host check.
// ---------------------------------------------------------------------------
await test("sitemap URLs taken from robots.txt are re-validated before fetching", async () => {
  const fn = SRC.match(/async function fetchSitemapUrls[\s\S]*?\n}/)?.[0] || "";
  if (!/assertPublicHost/.test(fn)) {
    throw new Error(
      "fetchSitemapUrls() passes `Sitemap:` values from the target's robots.txt (and <loc> values from a sitemap " +
        "index) straight to safeFetch with no assertPublicHost and no origin check. A site you audit can point its " +
        "own robots.txt at `Sitemap: http://127.0.0.1:6379/` and have the server fetch it."
    );
  }
  return "validated";
});

report();
