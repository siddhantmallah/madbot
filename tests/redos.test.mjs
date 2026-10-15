// Every HTML extractor, against HTML written to make it slow.
//   node --no-warnings --import ./tests/_register.mjs tests/redos.test.mjs
//
// /api/audit and /api/read-site parse pages that strangers point us at, and the
// audit reads up to 1.2 MB of one. A pattern like <meta[^>]+name=... restarts
// at every "<meta" and scans to the end of the document each time, so 240 KB of
// "<meta " took 4 seconds for one expression and 1.2 MB takes minutes: one GET
// pins a serverless function for its whole budget. This suite feeds each
// extractor the shapes that trigger that and fails anything over budget.
//
// REDOS_KB sets the payload size. The default is the audit's real cap.
import { suite, test, report } from "./_harness.mjs";

const H = await import("../lib/htmlParse.js");

const KB = Number(process.env.REDOS_KB || 1200);
const SIZE = KB * 1024;
// Linear code reads 1.2 MB in a few milliseconds per pass. The budget is far
// above that so a slow CI box does not flake, and far below what any
// quadratic path needs at this size.
const BUDGET_MS = Number(process.env.REDOS_BUDGET_MS || 1500);
const BASE = "https://example.com/";

const fill = (unit) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);

// Each shape is an opener with nothing to close it, or a run with nothing to
// end it: the two things a backtracking scan has to go to the end to rule out.
const SHAPES = {
  "<meta ": fill("<meta "),
  '<meta name="description" ': fill('<meta name="description" '),
  '<meta content="': fill('<meta content="'),
  "<link ": fill("<link "),
  '<link rel="icon" ': fill('<link rel="icon" '),
  "<a ": fill("<a "),
  '<a href="x">': fill('<a href="x">'),
  "<img ": fill("<img "),
  '<img alt="': fill('<img alt="') ,
  "<title>": fill("<title>"),
  "<h1>": fill("<h1>"),
  "<script": fill("<script"),
  '<script type="application/ld+json">': fill('<script type="application/ld+json">'),
  "<style": fill("<style"),
  "<noscript": fill("<noscript"),
  "<!--": fill("<!--"),
  "<head>": fill("<head>"),
  "<html ": fill("<html "),
  "<ins ": fill("<ins "),
  "<iframe ": fill("<iframe "),
  "<": fill("<"),
  "one long word": fill("a"),
  "letters then @": fill("abcdefghij@"),
  "@": fill("@"),
  'href="': fill('href="'),
  "<head><script src=": "<head>" + fill("<script src=x "),
  // The same openers with one closer at the very end, so a scanner cannot stop
  // early on "nothing closes this" and has to do the work.
  '<meta content=" … >': fill('<meta content="') + ">",
  '<link rel="icon" … >': fill('<link rel="icon" ') + ">",
  "<a … >": fill("<a ") + ">",
  "<img alt=\" … >": fill('<img alt="') + ">",
  "<h1> … </h1>": fill("<h1>") + "</h1>",
  "<a href> … </a>": fill('<a href="/x">') + "</a>",
  "<script> … </script>": fill('<script type="application/ld+json">') + "</script>",
  "<head> … </head>": fill("<head>") + "</head>",
  "<!-- … -->": fill("<!--") + "-->",
  "short tags": fill('<meta name="x" content="y"><a href="/p">p</a><img src="i.png">'),
};

const FNS = {
  metaContent: (h) => H.metaContent(h, "description"),
  propContent: (h) => H.propContent(h, "og:title"),
  visibleText: (h) => H.visibleText(h),
  visibleWordCount: (h) => H.visibleWordCount(h),
  schemaTypes: (h) => H.schemaTypes(h),
  linkStats: (h) => H.linkStats(h, BASE),
  extractIcon: (h) => H.extractIcon(h, BASE),
  parsePage: (h) => H.parsePage(h, BASE),
  charsetOf: (h) => H.charsetOf(h, ""),
  headingOutline: (h) => H.headingOutline(h),
  socialProfiles: (h) => H.socialProfiles(h, BASE),
  analyticsTools: (h) => H.analyticsTools(h),
  deprecatedTags: (h) => H.deprecatedTags(h),
  domElementCount: (h) => H.domElementCount(h),
  plaintextEmails: (h) => H.plaintextEmails(h),
  mixedContentUrls: (h) => H.mixedContentUrls(h),
  textToHtmlRatio: (h) => H.textToHtmlRatio(h),
  keywordConsistency: (h) => H.keywordConsistency(h, {}),
  imagesMissingDimensions: (h) => H.imagesMissingDimensions(h),
  blockingHeadScripts: (h) => H.blockingHeadScripts(h),
  twitterCardTags: (h) => H.twitterCardTags(h),
  policyLinks: (h) => H.policyLinks(h, BASE),
  consentSignals: (h) => H.consentSignals(h),
  adsenseSignals: (h) => H.adsenseSignals(h),
  titleOf: (h) => H.titleOf(h),
  h1Of: (h) => H.h1Of(h),
  htmlLang: (h) => H.htmlLang(h),
  canonicalOf: (h) => H.canonicalOf(h),
  imgTags: (h) => H.imgTags(h),
  stylesheetCount: (h) => H.stylesheetCount(h),
};

suite(`HTML extractors on ${KB} KB of hostile input (budget ${BUDGET_MS} ms per call)`);

for (const [fname, fn] of Object.entries(FNS)) {
  await test(`${fname} stays linear on every hostile shape`, () => {
    if (typeof H[fname] !== "function") throw new Error(`lib/htmlParse.js does not export ${fname}`);
    const slow = [];
    let worst = 0;
    for (const [shape, html] of Object.entries(SHAPES)) {
      const t = performance.now();
      fn(html);
      const ms = performance.now() - t;
      worst = Math.max(worst, ms);
      if (ms > BUDGET_MS) slow.push(`${JSON.stringify(shape)} ${Math.round(ms)} ms`);
    }
    if (slow.length) throw new Error(`over budget: ${slow.join("; ")}`);
    return `worst ${Math.round(worst)} ms`;
  });
}

report();
