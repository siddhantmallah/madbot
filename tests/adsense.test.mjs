// lib/robotsTxt.js and lib/adsenseReady.js — the AdSense readiness section.
//   node --no-warnings --import ./tests/_register.mjs tests/adsense.test.mjs
//
// Every case here is a pure function over a string, so this suite needs no
// network and no fixture server — unlike the runAudit cases, which have to
// reach a real site.
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const { disallowsEverything, namesAgent, robotsGroups, sitemapsIn } = await import("../lib/robotsTxt.js");
const { buildAdsenseReport, parseAdsTxt, ADSENSE_THRESHOLDS } = await import("../lib/adsenseReady.js");

suite("robots.txt + AdSense readiness");

// ---------------------------------------------------------------------------
// 1. robots.txt group scoping.
// ---------------------------------------------------------------------------
await test("a blanket disallow inside the * group blocks everyone", () => {
  eq(disallowsEverything("User-agent: *\nDisallow: /"), true, "blocksAll");
});

await test("a blanket disallow in a NAMED group does not block everyone", () => {
  const body = "User-agent: *\nDisallow: /admin\n\nUser-agent: BadBot\nDisallow: /";
  eq(disallowsEverything(body, "*"), false, "* is not blocked");
  eq(disallowsEverything(body, "badbot"), true, "BadBot is blocked");
  return "the lazy-wildcard regression stays fixed";
});

await test("consecutive user-agent lines form one group", () => {
  const body = "User-agent: *\nUser-agent: Mediapartners-Google\nDisallow: /";
  eq(disallowsEverything(body, "*"), true, "* in the shared group");
  eq(disallowsEverything(body, "mediapartners-google"), true, "the ad crawler too");
  eq(robotsGroups(body).length, 1, "group count");
});

await test("the ad crawler can be excluded on its own", () => {
  const body = "User-agent: *\nAllow: /\n\nUser-agent: Mediapartners-Google\nDisallow: /";
  eq(disallowsEverything(body, "*"), false, "search crawlers fine");
  eq(disallowsEverything(body, "mediapartners-google"), true, "ad crawler shut out");
  eq(namesAgent(body, "mediapartners-google"), true, "named explicitly");
});

await test("Allow: / carves the root back out of a blanket Disallow", () => {
  eq(disallowsEverything("User-agent: *\nDisallow: /\nAllow: /"), false, "longest match wins");
});

await test("comments, CRLF and blank lines are handled", () => {
  const body = "# a comment\r\nUser-agent: *\r\nDisallow: /   # trailing\r\n\r\nSitemap: https://x.test/sitemap.xml\r\n";
  eq(disallowsEverything(body), true, "blocksAll through CRLF");
  eq(sitemapsIn(body).length, 1, "sitemap found");
  eq(sitemapsIn(body)[0], "https://x.test/sitemap.xml", "sitemap url");
});

await test("an empty or absent robots.txt blocks nobody", () => {
  eq(disallowsEverything(""), false, "empty");
  eq(disallowsEverything(null), false, "null");
  eq(disallowsEverything("Disallow: /"), false, "a directive with no group applies to nobody");
});

// ---------------------------------------------------------------------------
// 2. ads.txt parsing.
// ---------------------------------------------------------------------------
await test("a normal Google ads.txt record parses", () => {
  const p = parseAdsTxt("google.com, pub-2309671102557521, DIRECT, f08c47fec0942fa0");
  eq(p.records.length, 1, "records");
  eq(p.googlePubIds[0], "pub-2309671102557521", "google id");
  eq(p.malformed, 0, "malformed");
});

await test("ca-pub- and pub- spellings of the same id compare equal", () => {
  // The page writes ca-pub-…; the file writes pub-…. Treating them as
  // different ids would report a correct setup as broken.
  const p = parseAdsTxt("google.com, ca-pub-123456789012345, DIRECT");
  eq(p.googlePubIds[0], "pub-123456789012345", "normalised to the ads.txt spelling");
});

await test("comments and variable lines are not records", () => {
  const p = parseAdsTxt("# header\nsubdomain=ads.example.com\ncontact=me@example.com\n\ngoogle.com, pub-1234567890, RESELLER, f08c47fec0942fa0");
  eq(p.records.length, 1, "one record");
  eq(p.variables.length, 2, "two variables");
  eq(p.malformed, 0, "variables are not malformed records");
});

await test("lines missing fields or a relationship are counted as malformed", () => {
  const p = parseAdsTxt("google.com, pub-1\nfoo.com, pub-2, WHATEVER, x\ngoogle.com, pub-3, DIRECT");
  eq(p.records.length, 1, "only the valid line");
  eq(p.malformed, 2, "two bad lines");
});

// ---------------------------------------------------------------------------
// 3. buildAdsenseReport — the verdicts.
// ---------------------------------------------------------------------------
const GOOD_PAGE = `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://fundingchoicesmessages.google.com/i/pub-1?ers=1"></script>
</head><body><h1>A real site</h1>
<p>${Array.from({ length: 700 }, (_, i) => `word${i}`).join(" ")}</p>
<footer><a href="/privacy-policy">Privacy Policy</a><a href="/about-us">About us</a><a href="/contact">Contact</a></footer>
</body></html>`;

const base = "https://example.test/";

function run(overrides = {}) {
  return buildAdsenseReport({
    html: GOOD_PAGE,
    base,
    https: true,
    viewport: true,
    lang: "en",
    wordCount: 700,
    distinctPages: 20,
    sitemapUrls: 20,
    robots: { exists: true },
    robotsBody: "User-agent: *\nAllow: /",
    adsTxt: { exists: true, body: "google.com, pub-9999999999999999, DIRECT, f08c47fec0942fa0" },
    ...overrides,
  });
}

const SEVERITIES = new Set(["critical", "warning", "good"]);

await test("the report has the same shape as the main audit's", () => {
  const r = run();
  for (const k of ["score", "counts", "findings", "stats", "notes"]) {
    truthy(k in r, `has ${k}`);
  }
  if (r.score < 5 || r.score > 100) throw new Error(`score out of range: ${r.score}`);
  r.findings.forEach((f, i) => {
    if (!SEVERITIES.has(f.severity)) throw new Error(`findings[${i}].severity = ${f.severity}`);
    if (!f.area || !f.title) throw new Error(`findings[${i}] missing area or title`);
    if (f.severity !== "good" && !f.fix) throw new Error(`findings[${i}] "${f.title}" has no fix`);
    if ("weight" in f) throw new Error(`findings[${i}] leaks the internal weight`);
  });
  const actual = {
    critical: r.findings.filter((f) => f.severity === "critical").length,
    warning: r.findings.filter((f) => f.severity === "warning").length,
    good: r.findings.filter((f) => f.severity === "good").length,
  };
  for (const k of Object.keys(actual)) eq(r.counts[k], actual[k], `counts.${k}`);
  return `score ${r.score}, ${r.findings.length} findings`;
});

await test("a site that meets every mechanical requirement scores well", () => {
  const r = run();
  eq(r.counts.critical, 0, "no criticals");
  if (r.score < 80) throw new Error(`a compliant site scored ${r.score}`);
  return `score ${r.score}`;
});

await test("the report never claims approval is predictable", () => {
  const r = run();
  truthy(r.notes.some((n) => /human review/i.test(n)), "says approval is a human review");
  truthy(r.notes.some((n) => /not judged here|cannot assess/i.test(n)), "disclaims content judgement");
});

await test("an ads.txt that omits Google is critical and caps the score", () => {
  const r = run({ adsTxt: { exists: true, body: "someoneelse.com, pub-1, DIRECT" } });
  const f = r.findings.find((x) => /does not list google/i.test(x.title));
  truthy(f, "the finding exists");
  eq(f.severity, "critical", "severity");
  if (r.score > 45) throw new Error(`score ${r.score} not capped by an unmonetisable ads.txt`);
  return `score ${r.score}`;
});

await test("a missing ads.txt is a warning, not a critical", () => {
  // It is recommended, not required. Reporting it as fatal would be wrong.
  const r = run({ adsTxt: { exists: false, body: "" } });
  const f = r.findings.find((x) => /no ads\.txt/i.test(x.title));
  eq(f.severity, "warning", "severity");
});

await test("a publisher id on the page that ads.txt does not authorise is critical", () => {
  const html = GOOD_PAGE.replace(
    "</head>",
    '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5555555555555555"></script></head>'
  );
  const r = run({ html, adsTxt: { exists: true, body: "google.com, pub-9999999999999999, DIRECT" } });
  const f = r.findings.find((x) => /not the one in ads\.txt/i.test(x.title));
  truthy(f, "mismatch reported");
  eq(f.severity, "critical", "severity");
  truthy(/ca-pub-5555555555555555/.test(f.detail), "names the id on the page");
  truthy(/pub-9999999999999999/.test(f.detail), "names the id in the file");
});

await test("the same id in both spellings is NOT reported as a mismatch", () => {
  const html = GOOD_PAGE.replace(
    "</head>",
    '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9999999999999999"></script></head>'
  );
  const r = run({ html, adsTxt: { exists: true, body: "google.com, pub-9999999999999999, DIRECT" } });
  truthy(!r.findings.some((x) => /not the one in ads\.txt/i.test(x.title)), "no false mismatch");
});

await test("robots.txt excluding Mediapartners-Google is critical", () => {
  const r = run({ robotsBody: "User-agent: *\nAllow: /\n\nUser-agent: Mediapartners-Google\nDisallow: /" });
  const f = r.findings.find((x) => /Mediapartners-Google/i.test(x.title));
  truthy(f, "the finding exists");
  eq(f.severity, "critical", "severity");
});

await test("a thin page is reported as the reason applications get refused", () => {
  const r = run({ wordCount: 80, distinctPages: 0, sitemapUrls: 0 });
  const thin = r.findings.find((x) => /words on this page/i.test(x.title));
  eq(thin.severity, "critical", "thin content severity");
  truthy(/low value content/i.test(thin.detail), "names the actual rejection reason");
  const single = r.findings.find((x) => /single page/i.test(x.title));
  eq(single.severity, "critical", "single-page severity");
});

await test("the thresholds the copy quotes are the ones the verdict used", () => {
  const T = ADSENSE_THRESHOLDS;
  const justUnder = run({ wordCount: T.wordsThin - 1 });
  const justOver = run({ wordCount: T.wordsThin });
  eq(justUnder.findings.find((x) => /words on this page/i.test(x.title)).severity, "critical", "under the line");
  eq(justOver.findings.find((x) => /words on this page/i.test(x.title)).severity, "warning", "on the line");
});

await test("no privacy policy is critical, because Google's policies require one", () => {
  const r = run({ html: GOOD_PAGE.replace('<a href="/privacy-policy">Privacy Policy</a>', "") });
  const f = r.findings.find((x) => /no privacy policy/i.test(x.title));
  eq(f.severity, "critical", "severity");
  if (r.score > 55) throw new Error(`score ${r.score} not capped without a privacy policy`);
});

await test("a page we could only read part of is not accused of lacking a policy", () => {
  // The footer is the first thing lost to the byte cap, so a partial read must
  // downgrade to "could not confirm" rather than assert an absence.
  const r = run({ html: GOOD_PAGE.replace('<a href="/privacy-policy">Privacy Policy</a>', ""), truncated: true, htmlKb: 1200 });
  truthy(!r.findings.some((x) => /^no privacy policy/i.test(x.title)), "no false absence");
  const f = r.findings.find((x) => /could not confirm a privacy policy/i.test(x.title));
  eq(f.severity, "warning", "downgraded");
  truthy(r.notes.some((n) => /read only as far as our limit/i.test(n)), "the partial read is disclosed");
});

await test("Google's own CMP passes; an unrecognised one is only a warning", () => {
  eq(run().findings.find((x) => /consent platform detected/i.test(x.title)).severity, "good", "Funding Choices");
  const other = run({ html: GOOD_PAGE.replace(/fundingchoicesmessages\.google\.com[^"]*/, "cdn.cookiebot.com/uc.js") });
  eq(other.findings.find((x) => /consent platform detected/i.test(x.title)).severity, "warning", "Cookiebot");
  const none = run({ html: GOOD_PAGE.replace(/<script[^>]*fundingchoices[^>]*><\/script>/, "") });
  eq(none.findings.find((x) => /no consent platform/i.test(x.title)).severity, "critical", "nothing at all");
});

await test("slots with no loader is critical; the loader with no slots is Auto ads", () => {
  const orphaned = run({ html: GOOD_PAGE.replace("<h1>", '<ins class="adsbygoogle"></ins><h1>') });
  const f = orphaned.findings.find((x) => /no AdSense script/i.test(x.title));
  eq(f.severity, "critical", "orphaned slots");

  const auto = run({
    html: GOOD_PAGE.replace(
      "</head>",
      '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9999999999999999"></script></head>'
    ),
  });
  truthy(auto.findings.some((x) => /Auto ads/i.test(x.title)), "recognised as Auto ads");
});

await test("more advertising than content is reported as a policy risk", () => {
  const slots = Array.from({ length: 8 }, () => '<ins class="adsbygoogle"></ins>').join("");
  const html = GOOD_PAGE.replace(
    "</head>",
    '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9999999999999999"></script></head>'
  ).replace("<h1>", `${slots}<h1>`);
  const r = run({ html, wordCount: 400 });
  const f = r.findings.find((x) => /ad slots against/i.test(x.title));
  truthy(f, "the finding exists");
  eq(f.severity, "critical", "severity");
  return `${Math.round(400 / 8)} words per slot, threshold ${ADSENSE_THRESHOLDS.wordsPerSlot}`;
});

await test("no HTTPS is fatal for advertising and caps the score", () => {
  const r = run({ https: false });
  eq(r.findings.find((x) => /not served over HTTPS/i.test(x.title)).severity, "critical", "severity");
  if (r.score > 50) throw new Error(`score ${r.score} not capped without HTTPS`);
});

report();
