// lib/htmlParse.js — the extractors the report's new checks are built on.
//   node --no-warnings --import ./tests/_register.mjs tests/htmlparse.test.mjs
//
// All pure string work, so this suite runs offline. The cases that matter most
// are the false positives: a check that fires on a page that is fine is worse
// than one that never fires at all, because it costs the reader their trust in
// the other forty.
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const H = await import("../lib/htmlParse.js");

suite("lib/htmlParse.js — audit extractors");

// ---------------------------------------------------------------------------
// keywordConsistency — the two ways this went wrong.
// ---------------------------------------------------------------------------
await test("a two-word phrase is only reported if the words were adjacent", () => {
  // "Read the story" must not become the phrase "read story". Dropping the
  // stopword first and pairing afterwards invents phrases the page never says,
  // and this one outranked the real term on a real site.
  const body = Array.from({ length: 40 }, () => "Ship faster with Acme. Read the story.").join(" ");
  const k = H.keywordConsistency(`<html><body><p>${body}</p></body></html>`, { title: "Acme", h1: "Acme" });
  truthy(!k.terms.some((t) => t.term === "read story"), "no phrase across a dropped stopword");
  truthy(!k.terms.some((t) => t.term === "acme read"), "no phrase across a sentence boundary");
  truthy(k.terms.some((t) => t.term === "ship faster"), "the real adjacent phrase is found");
  return k.terms.map((t) => `${t.term}:${t.count}`).join(", ");
});

await test("repeated link labels are treated as interface, not topic", () => {
  const cards = Array.from({ length: 8 }, () => '<a href="/x">Read story</a>').join("");
  const prose = Array.from({ length: 30 }, () => "financial infrastructure for the internet").join(" ");
  const k = H.keywordConsistency(`<html><body><p>${prose}</p>${cards}</body></html>`, { title: "Acme" });
  truthy(!k.terms.some((t) => t.term.includes("story")), "the CTA is gone");
  eq(k.terms[0].term, "financial infrastructure", "the actual topic ranks first");
});

await test("the verdict rests on the strongest term, not on any term", () => {
  // The filler is all distinct words, so it can neither repeat into a term of
  // its own nor form a phrase that outranks the one under test.
  const filler = Array.from({ length: 60 }, (_, i) => `filler${i}`).join(" ");
  const prose = `${Array.from({ length: 30 }, () => "widgets").join(" ")} ${Array.from({ length: 4 }, () => "sprockets").join(" ")} ${filler}`;
  const covered = H.keywordConsistency(`<html><body><p>${prose}</p></body></html>`, { title: "Widgets by Acme" });
  eq(covered.primary.term, "widgets", "primary is the most-used term");
  eq(covered.missesPrimary, false, "primary is covered by the title");
  truthy(covered.missedEverywhere.length > 0, "a secondary term is still recorded as missed");

  const bare = H.keywordConsistency(`<html><body><p>${prose}</p></body></html>`, { title: "Home" });
  eq(bare.missesPrimary, true, "an uncovered primary is reported");
});

await test("a page too thin to have a topic is not judged", () => {
  eq(H.keywordConsistency("<html><body><p>Hello there friend</p></body></html>").measurable, false, "measurable");
});

// ---------------------------------------------------------------------------
// policyLinks — the AdSense section turns a miss here into a critical.
// ---------------------------------------------------------------------------
const linkPage = (hrefs) =>
  `<html><body>${hrefs.map(([h, t]) => `<a href="${h}">${t || "link"}</a>`).join("")}</body></html>`;

await test("the usual privacy policy URLs are all found", () => {
  for (const href of ["/privacy", "/privacy/", "/privacy-policy", "/privacypolicy", "/legal/privacy", "/en/privacy-notice", "/datenschutz", "/politique-de-confidentialite", "/privacy.html"]) {
    const found = H.policyLinks(linkPage([[href]]), "https://x.test/");
    truthy(found.privacy, `privacy found for ${href}`);
  }
});

await test("a blog post about privacy is NOT a privacy policy", () => {
  // The loose substring test marked this as compliant, and the AdSense section
  // would then have reported a genuinely missing policy as present.
  const found = H.policyLinks(linkPage([["/blog/privacy-first-analytics", "Privacy-first analytics"]]), "https://x.test/");
  truthy(!found.privacy, "not counted");
});

await test("somebody else's privacy policy does not count as yours", () => {
  const found = H.policyLinks(linkPage([["https://other.test/privacy", "Privacy"]]), "https://x.test/");
  truthy(!found.privacy, "cross-host link ignored");
});

await test("a policy page nested deeper than the last segment is found", () => {
  const found = H.policyLinks(linkPage([["/in/contact/sales", "Contact sales"]]), "https://x.test/");
  eq(found.contact, "https://x.test/in/contact/sales", "exact segment match");
});

await test("an opaque URL is found by its link text", () => {
  const found = H.policyLinks(linkPage([["/p/1288", "Privacy Policy"]]), "https://x.test/");
  truthy(found.privacy, "matched on the label");
});

await test("hrefs are read even when the anchor markup is enormous", () => {
  // Pass one reads every href on the page, so a footer link wrapped in a
  // hundred nested spans is not missed by the anchor-text pass alone.
  const inner = "<span>".repeat(60) + "Privacy" + "</span>".repeat(60);
  const found = H.policyLinks(`<html><body><a href="/privacy-policy">${inner}</a></body></html>`, "https://x.test/");
  truthy(found.privacy, "found by path");
});

// ---------------------------------------------------------------------------
// socialProfiles — a share button is not a profile.
// ---------------------------------------------------------------------------
await test("share and intent links are not counted as profiles", () => {
  const html = linkPage([
    ["https://www.facebook.com/sharer/sharer.php?u=x", "Share"],
    ["https://twitter.com/intent/tweet?text=x", "Tweet"],
    ["https://www.linkedin.com/shareArticle?url=x", "Share"],
    ["https://facebook.com/", "Facebook"],
  ]);
  eq(H.socialProfiles(html, "https://x.test/").length, 0, "nothing counted");
});

await test("real profiles are counted once each", () => {
  const html = linkPage([
    ["https://www.instagram.com/acme", "Instagram"],
    ["https://www.instagram.com/acme", "Instagram again"],
    ["https://x.com/acme", "X"],
  ]);
  const found = H.socialProfiles(html, "https://x.test/");
  eq(found.length, 2, "deduped");
  truthy(found.some((f) => f.network === "Instagram"), "Instagram");
  truthy(found.some((f) => f.network === "X"), "X");
});

// ---------------------------------------------------------------------------
// mixedContentUrls — subresources only.
// ---------------------------------------------------------------------------
await test("an http link is not mixed content; an http script is", () => {
  eq(H.mixedContentUrls('<a href="http://other.test/page">out</a>').length, 0, "anchors ignored");
  const bad = H.mixedContentUrls('<script src="http://cdn.test/a.js"></script><img src="http://cdn.test/b.png">');
  eq(bad.length, 2, "script and image caught");
});

// ---------------------------------------------------------------------------
// The rest of the extractors.
// ---------------------------------------------------------------------------
await test("heading outline reports skipped levels", () => {
  eq(H.headingOutline("<h1>a</h1><h3>b</h3>").skips.length, 1, "H1 to H3 is a skip");
  eq(H.headingOutline("<h1>a</h1><h2>b</h2><h3>c</h3>").skips.length, 0, "a clean outline");
  eq(H.headingOutline("<h2>a</h2>").startsAtH1, false, "starts below H1");
  eq(H.headingOutline("<h1>a</h1><h2>b</h2><h2>c</h2>").counts.h2, 2, "h2 count");
});

await test("charset is read from the document, then from the header", () => {
  eq(H.charsetOf('<meta charset="UTF-8">', null).value, "utf-8", "from the document");
  eq(H.charsetOf('<meta charset="UTF-8">', null).from, "document", "source");
  eq(H.charsetOf("<html></html>", "text/html; charset=iso-8859-1").value, "iso-8859-1", "from the header");
  eq(H.charsetOf("<html></html>", "text/html").value, null, "neither");
});

await test("only scripts that actually block are counted", () => {
  const html = '<head><script src="a.js"></script><script src="b.js" defer></script><script src="c.js" async></script><script>inline()</script></head><body><script src="d.js"></script></body>';
  eq(H.blockingHeadScripts(html), 1, "one blocking script in the head");
});

await test("images are checked for both dimensions", () => {
  const html = '<img src="a.png" width="10" height="10"><img src="b.png" width="10"><img src="c.png">';
  const d = H.imagesMissingDimensions(html);
  eq(d.total, 3, "total");
  eq(d.missing, 2, "one dimension is not enough");
});

await test("deprecated tags are found and counted", () => {
  const found = H.deprecatedTags("<center><font size=2>x</font></center><p>ok</p>");
  eq(found.length, 2, "two kinds");
  truthy(found.some((t) => t.tag === "center"), "center");
  eq(H.deprecatedTags("<p>modern</p>").length, 0, "nothing on a clean page");
});

await test("plaintext emails are found; asset filenames are not", () => {
  const found = H.plaintextEmails('<a href="mailto:Sales@Acme.test">write</a><img src="logo@2x.test.png">');
  eq(found.length, 1, "one address");
  eq(found[0], "sales@acme.test", "lowercased");
});

await test("analytics tags are recognised by their real signatures", () => {
  eq(H.analyticsTools('<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script>')[0], "Google Analytics 4", "GA4");
  truthy(H.analyticsTools('<script src="https://plausible.io/js/script.js"></script>').includes("Plausible"), "Plausible");
  eq(H.analyticsTools("<p>nothing here</p>").length, 0, "no false positive");
});

await test("twitter card tags are read from name= and property=", () => {
  eq(H.twitterCardTags('<meta name="twitter:card" content="summary_large_image">').card, "summary_large_image", "name=");
  eq(H.twitterCardTags('<meta property="twitter:card" content="summary">').card, "summary", "property=");
  eq(H.twitterCardTags("<html></html>").card, "", "absent");
});

await test("consent signals separate a real CMP from a page that mentions cookies", () => {
  const cmp = H.consentSignals('<script src="https://consent.cookiebot.com/uc.js"></script>');
  eq(cmp.vendors[0], "Cookiebot", "vendor named");
  const weak = H.consentSignals('<div class="cookie-notice">We use cookies</div>');
  eq(weak.vendors.length, 0, "no vendor claimed");
  eq(weak.banner, true, "reported only as the weaker signal");
  eq(H.consentSignals("<script>window.__tcfapi = f;</script>").tcfApi, true, "TCF api");
});

await test("adsense signals distinguish the loader, the slots and verification", () => {
  const full = H.adsenseSignals(
    '<meta name="google-adsense-account" content="ca-pub-2309671102557521">' +
      '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2309671102557521"></script>' +
      '<ins class="adsbygoogle"></ins><ins class="adsbygoogle"></ins>'
  );
  eq(full.loader, true, "loader");
  eq(full.slots, 2, "slots");
  eq(full.clients.length, 1, "one publisher id, deduped across three surfaces");
  eq(full.clients[0], "ca-pub-2309671102557521", "the id");

  const orphan = H.adsenseSignals('<ins class="adsbygoogle"></ins>');
  eq(orphan.loader, false, "no loader");
  eq(orphan.slots, 1, "slot still counted");

  eq(H.adsenseSignals("<p>nothing</p>").loader, false, "clean page");
});

await test("text-to-HTML ratio is a percentage of the delivered bytes", () => {
  const ratio = H.textToHtmlRatio("<html><body><p>hello world</p></body></html>");
  if (ratio <= 0 || ratio > 100) throw new Error(`ratio out of range: ${ratio}`);
  const markupHeavy = H.textToHtmlRatio(`<div>${"<span></span>".repeat(200)}hi</div>`);
  if (markupHeavy > 5) throw new Error(`markup-heavy page reported ${markupHeavy}%`);
  return `${ratio}% plain, ${markupHeavy}% markup-heavy`;
});

report();
