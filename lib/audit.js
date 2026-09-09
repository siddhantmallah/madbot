import { normalizeUrl, assertPublicHost, safeFetch } from "./urlGuard";
import { disallowsEverything, sitemapsIn } from "./robotsTxt";
import { buildAdsenseReport } from "./adsenseReady";
import {
  analyticsTools,
  blockingHeadScripts,
  charsetOf,
  countMatches,
  deprecatedTags,
  domElementCount,
  extractIcon,
  first,
  headingOutline,
  imagesMissingDimensions,
  keywordConsistency,
  linkStats,
  metaContent,
  mixedContentUrls,
  plaintextEmails,
  propContent,
  schemaTypes,
  socialProfiles,
  textToHtmlRatio,
  twitterCardTags,
  visibleWordCount,
} from "./htmlParse";

export { diffSnapshots } from "./auditClient";
import { THRESHOLDS as T, SCORE_FLOOR, criticalCeiling } from "./auditClient";

// A path no real site has. Requesting it is how we find out whether the site
// has a working 404 — which is not pedantry: a site that answers 200 to
// everything hands a crawler an infinite set of duplicate pages.
const NOT_FOUND_PROBE = "/madbot-audit-404-probe";

/**
 * Each finding carries what would actually be done about it — that's the
 * difference between a report and a plan.
 *
 * Scoring works in two layers, and the second one matters.
 *
 * `risk(n)` declares the worst this check could cost before it runs, so the
 * score is the share of what was achievable rather than 100 minus a total that
 * grows every time a check is added. Without it, adding this many checks would
 * have pushed every imperfect site to the floor and the number would have
 * stopped meaning anything.
 *
 * `blocks(n)` is the answer to the obvious objection to normalising: a site
 * whose robots.txt excludes everybody is not "92% healthy" because the other
 * forty checks passed. Nothing else can help while the site cannot be indexed,
 * so a blocker caps the score outright.
 */
function buildFindings(d) {
  const f = [];
  let maxPenalty = 0;
  let ceiling = 100;

  const add = (severity, area, title, detail, fix, weight = 0) =>
    f.push({ severity, area, title, detail, fix, weight });
  const risk = (n) => {
    maxPenalty += n;
  };
  const blocks = (n) => {
    ceiling = Math.min(ceiling, n);
  };

  // — Foundations —
  risk(12);
  if (!d.title) {
    add("critical", "Foundations", "No title tag", "Search engines have nothing to show as your headline in results.", "Write a title built around what you actually sell, in the length Google renders without truncating.", 12);
  } else if (d.title.length > T.titleMax) {
    add("warning", "Foundations", `Title is ${d.title.length} characters`, `Google truncates around ${T.titleMax}, so the end of yours gets cut off in results.`, "Rewrite it front-loaded, so the part that matters survives truncation.", 4);
  } else if (d.title.length < T.titleMin) {
    add("warning", "Foundations", `Title is only ${d.title.length} characters`, "You're leaving room on the table where buying-intent words could sit.", "Extend it with the terms buyers actually search for.", 4);
  } else {
    add("good", "Foundations", "Title tag looks healthy", `${d.title.length} characters — inside the range Google renders in full.`, null, 0);
  }

  risk(10);
  if (!d.description) {
    add("critical", "Foundations", "No meta description", "Google is auto-generating your search snippet from whatever text it finds. You aren't writing your own pitch.", "Write a description per page that reads like an ad for the click, not a summary.", 10);
  } else if (d.description.length > T.descriptionMax) {
    add("warning", "Foundations", `Meta description is ${d.description.length} characters`, "It'll be cut off mid-sentence in results.", `Trim to land the point inside ${T.descriptionMax} characters.`, 3);
  } else if (d.description.length < T.descriptionMin) {
    add("warning", "Foundations", `Meta description is only ${d.description.length} characters`, "Short snippets waste space you could use to win the click.", "Expand it to use the full snippet width.", 3);
  } else {
    add("good", "Foundations", "Meta description present", `${d.description.length} characters — a sensible length.`, null, 0);
  }

  risk(10);
  if (d.h1Count === 0) {
    add("critical", "Foundations", "No H1 heading", "The single strongest on-page signal about what this page is about is missing.", "Add one clear H1 per page that names the thing, matching search intent.", 10);
  } else if (d.h1Count > 1) {
    add("warning", "Foundations", `${d.h1Count} H1 headings`, "Multiple H1s split the signal about what the page is primarily about.", "Collapse to one H1 and demote the rest to H2s.", 4);
  } else {
    add("good", "Foundations", "Exactly one H1", "Clear primary heading — that's what you want.", null, 0);
  }

  // Heading structure, separate from how many H1s there are. A wall of copy
  // under one heading is unreadable and unparseable; a jump from H1 to H3
  // leaves the H3 attributed to nothing.
  //
  // risk() sits inside the guard, not above it. A page with no headings at all
  // cannot be judged on its outline — the H1 check above has already said what
  // there is to say — and declaring the risk anyway would put 5 points in the
  // denominator that this page was never at risk of losing, quietly marking it
  // up for passing a check that never ran.
  if (d.headings.levels.length) {
    risk(5);
    if (d.wordCount >= T.wordsWarning && d.headings.counts.h2 === 0) {
      add("warning", "Foundations", "No subheadings anywhere on the page", `${d.wordCount} words under a single heading. Readers scan for the part that answers them, and both search and answer engines use subheadings to work out what each passage is about.`, "Break the page into sections with real H2s, each one a question or a claim.", 5);
    } else if (d.headings.skips.length) {
      const s = d.headings.skips[0];
      add("warning", "Foundations", `Heading levels skip H${s.from} to H${s.to}`, "The outline has a gap in it, so everything under that heading hangs off nothing — which is exactly how a screen reader and a document parser read it.", "Use the next level down rather than skipping, and style the size separately.", 2);
    } else {
      add("good", "Foundations", `Clean heading outline (${d.headings.counts.h2} H2s)`, "The page has a structure something can follow.", null, 0);
    }
  }

  risk(10);
  if (!d.viewport) {
    add("critical", "Foundations", "No mobile viewport tag", "Phones render the desktop layout scaled down. Most of your traffic is mobile.", "Add the viewport meta tag and check the layout actually reflows.", 10);
  } else {
    add("good", "Foundations", "Mobile viewport set", "The page declares how to render on phones.", null, 0);
  }

  risk(2);
  if (!d.lang) {
    add("warning", "Foundations", "No lang attribute on <html>", "Search engines and screen readers have to guess your language.", "Declare the page language explicitly.", 2);
  }

  risk(2);
  if (!d.charset.value) {
    add("warning", "Foundations", "No character encoding declared", "The browser guesses, and when it guesses wrong the page renders as mojibake — every apostrophe and dash turned to symbols.", "Declare <meta charset=\"utf-8\"> as the first thing in the head.", 2);
  }

  risk(2);
  if (!d.faviconUrl) {
    add("warning", "Foundations", "No favicon declared", "Your tab, bookmarks and search results show a blank placeholder.", "Add a favicon — small thing, but it reads as unfinished without one.", 2);
  }

  // You cannot improve what nobody is counting, and this is the cheapest
  // gap on the list to close.
  risk(4);
  if (d.analytics.length === 0) {
    add("warning", "Foundations", "No analytics detected", "Nothing on this page is measuring visits, so there is no way to tell whether any change to it worked.", "Install a measurement tag before changing anything, so the next report has a baseline to compare against.", 4);
  } else {
    add("good", "Foundations", `Measurement in place: ${d.analytics.slice(0, 3).join(", ")}`, "Changes to the site can be judged against something.", null, 0);
  }

  // — Crawlability & indexing —
  risk(15);
  if (!d.https) {
    add("critical", "Crawlability", "Not served over HTTPS", "Browsers flag the site as not secure and it's a direct ranking negative.", "Move to HTTPS and redirect every HTTP URL to it.", 15);
    blocks(45);
  } else {
    add("good", "Crawlability", "Served over HTTPS", "Encrypted, and eligible for the ranking that comes with it.", null, 0);
  }

  // The most expensive single line of HTML there is. A page carrying noindex
  // is asking to be removed from search, and usually nobody meant it — it is
  // a staging setting that shipped.
  risk(30);
  if (d.noindex) {
    add(
      "critical",
      "Crawlability",
      `This page asks search engines not to index it${d.noindexFrom === "header" ? " (X-Robots-Tag header)" : ""}`,
      `The ${d.noindexFrom === "header" ? "response header" : "robots meta tag"} says “${d.noindexValue}”. Search engines are being told to drop this page from results, and they will. Nothing else in this report can help while that line is there.`,
      "Remove the noindex. If it was meant for a staging environment, restrict that environment instead of the tag.",
      30
    );
    blocks(20);
  } else if (d.nofollow) {
    add("warning", "Crawlability", "This page tells crawlers not to follow its links", `The robots meta tag says “${d.noindexValue}”, so no ranking signal passes from here to any page you link to — including your own.`, "Drop nofollow from the page-level robots tag; apply it per link if you need it at all.", 5);
  } else {
    add("good", "Crawlability", "Indexable", "Nothing on the page is asking search engines to skip it.", null, 0);
  }

  risk(5);
  if (!d.canonical) {
    add("warning", "Crawlability", "No canonical tag", "If the same page is reachable at more than one URL, ranking signals get split between them.", "Set a self-referencing canonical on every page.", 5);
  } else {
    add("good", "Crawlability", "Canonical tag present", "Duplicate URLs won't split your ranking signals.", null, 0);
  }

  // Measured, not assumed: we asked for the http:// version and watched where
  // it landed.
  if (d.httpRedirect.checked) {
    risk(8);
    if (!d.httpRedirect.toHttps) {
      add("critical", "Crawlability", "The http:// version of this site does not redirect to https://", "Both versions are live, so you have two copies of every page competing with each other, and any old link or typed address lands on the insecure one.", "Redirect every http:// URL to its https:// equivalent with a 301.", 8);
    } else {
      add("good", "Crawlability", "http:// redirects to https://", "One canonical home for every URL.", null, 0);
    }
  }

  if (d.notFound.checked) {
    risk(6);
    if (d.notFound.soft) {
      add("warning", "Crawlability", "Missing pages answer 200 instead of 404", `We asked for ${NOT_FOUND_PROBE}, which cannot exist, and the site answered ${d.notFound.status}. Every mistyped or dead URL becomes another indexable duplicate of your content.`, "Return a real 404 status for pages that don't exist, with a page that helps people find what they wanted.", 6);
    } else {
      add("good", "Crawlability", "Missing pages return a proper 404", "Dead URLs don't turn into duplicate content.", null, 0);
    }
  }

  risk(20);
  if (d.robots.exists === false) {
    add("warning", "Crawlability", "No robots.txt", "You're not telling crawlers anything, including where your sitemap is.", "Add a robots.txt that points at your sitemap.", 3);
  } else if (d.robots.blocksAll) {
    add("critical", "Crawlability", "robots.txt blocks all crawlers", "Your own robots.txt is telling search engines to stay out. Nothing else matters until this is fixed.", "Remove the blanket disallow so the site can be indexed.", 20);
    blocks(20);
  } else {
    add("good", "Crawlability", "robots.txt present", d.robots.hasSitemap ? "And it points at your sitemap." : "Though it doesn't reference a sitemap.", null, 0);
  }

  risk(6);
  if (d.sitemap.exists === false) {
    add("warning", "Crawlability", "No sitemap.xml found", "Search engines are left to discover your pages by crawling alone, which is slower and less complete.", "Generate a sitemap and submit it, so new pages get found quickly.", 6);
  } else {
    add("good", "Crawlability", `Sitemap found${d.sitemap.urlCount ? ` (~${d.sitemap.urlCount} URLs)` : ""}`, "Search engines have a map of your pages.", null, 0);
  }

  risk(12);
  if (d.links.distinctPages === 0 && d.links.anchors > 2) {
    add(
      "critical",
      "Crawlability",
      "Everything lives on one page",
      `The navigation is ${d.links.anchors} same-page jumps and links out to ${d.links.distinctPages} other page${d.links.distinctPages === 1 ? "" : "s"}. A single page can only realistically rank for one topic — every other thing you sell has nowhere to rank from.`,
      "Split the strongest sections into their own pages, each targeting how buyers actually search for that specific thing, and link them from the homepage.",
      12
    );
  } else if (d.links.distinctPages < T.pagesLinked) {
    add("warning", "Crawlability", d.links.distinctPages === 0 ? "No other pages linked from here" : `Only ${d.links.distinctPages} other page${d.links.distinctPages === 1 ? "" : "s"} linked from here`, "Crawlers find and rank pages by following links. A thin internal structure leaves pages stranded and caps how many terms you can rank for.", "Build out and interlink the pages worth ranking, so each has its own path in.", 6);
  } else {
    add("good", "Crawlability", `${d.links.distinctPages} internal pages linked`, "Crawlers have paths into the rest of the site.", null, 0);
  }

  // — AI & structured data: the differentiating angle, and genuinely checkable —
  risk(14);
  if (d.schemaTypes.length === 0) {
    add("critical", "AI & structured data", "No structured data at all", "Answer engines and rich results rely on schema markup to understand a page. Yours has none, so you're invisible to the surfaces that are quietly taking over product research.", "Mark up what you are — Organization, Product, FAQ, LocalBusiness as applicable — so machines can parse and cite you.", 14);
  } else {
    add("good", "AI & structured data", `Structured data found: ${d.schemaTypes.slice(0, 4).join(", ")}`, "Machines can parse at least part of this page.", null, 0);
    risk(5);
    if (!d.schemaTypes.some((t) => /FAQ|QAPage|HowTo/i.test(t))) {
      add("warning", "AI & structured data", "No FAQ or Q&A markup", "Question-shaped markup is the format answer engines quote most readily.", "Add FAQ schema to the pages that answer real buyer questions.", 5);
    } else {
      add("good", "AI & structured data", "Question-shaped markup present", "The format answer engines quote most readily.", null, 0);
    }
  }

  // — Sharing —
  risk(6);
  const ogMissing = [];
  if (!d.ogTitle) ogMissing.push("og:title");
  if (!d.ogDescription) ogMissing.push("og:description");
  if (!d.ogImage) ogMissing.push("og:image");
  if (ogMissing.length === 3) {
    add("warning", "Sharing", "No Open Graph tags", "Every link to you shared on social or in chat renders as a bare grey URL with no image.", "Add Open Graph title, description and image so shared links look deliberate.", 6);
  } else if (ogMissing.length > 0) {
    add("warning", "Sharing", `Missing ${ogMissing.join(", ")}`, "Shared links render incompletely.", "Fill in the remaining Open Graph tags.", 3);
  } else {
    add("good", "Sharing", "Open Graph tags complete", "Shared links will render with a title, description and image.", null, 0);
  }

  // X falls back to Open Graph for the title and image, but not for the card
  // type — which is what decides whether the image is a thumbnail or the whole
  // width of the post.
  risk(3);
  if (!d.twitter.card) {
    add("warning", "Sharing", "No Twitter/X card type", d.ogImage ? "Your Open Graph image will be used, but without a card type X renders it as a small thumbnail rather than the full-width image." : "Links shared on X will render as plain text.", "Set twitter:card to summary_large_image on pages with a decent image.", 3);
  } else {
    add("good", "Sharing", `Twitter/X card set (${d.twitter.card})`, "Shared links render the way you chose.", null, 0);
  }

  risk(2);
  if (d.social.length === 0) {
    add("warning", "Sharing", "No social profiles linked from the page", "Search engines use outbound profile links to tie a site to a known entity, and visitors use them to check you exist.", "Link the profiles you actually maintain, and mark them up as sameAs in your Organization schema.", 2);
  } else {
    add("good", "Sharing", `${d.social.length} social profile${d.social.length === 1 ? "" : "s"} linked`, d.social.map((s) => s.network).join(", "), null, 0);
  }

  // — Content —
  risk(10);
  if (d.wordCount < T.wordsCritical) {
    add("critical", "Content", `Only ~${d.wordCount} words of text on the homepage`, "There's very little for a search engine to understand you by, and nothing for an answer engine to quote.", "Add substantive copy that answers what you do, for whom, and why you're different.", 10);
  } else if (d.wordCount < T.wordsWarning) {
    add("warning", "Content", `~${d.wordCount} words on the homepage`, "Thin for a page expected to rank on competitive terms.", "Deepen the page around the questions buyers ask before they contact you.", 5);
  } else {
    add("good", "Content", `~${d.wordCount} words of copy`, "Enough substance for search engines to work with.", null, 0);
  }

  if (d.images > 0) {
    risk(8);
    if (d.imagesMissingAlt > 0) {
      const pct = Math.round((d.imagesMissingAlt / d.images) * 100);
      add(
        pct > T.altMissingPct ? "critical" : "warning",
        "Content",
        `${d.imagesMissingAlt} of ${d.images} images have no alt text`,
        "Alt text is how image search and screen readers understand your images. It's also free keyword context you're not using.",
        "Write descriptive alt text on every meaningful image.",
        pct > T.altMissingPct ? 8 : 4
      );
    } else {
      add("good", "Content", "All images have alt text", `${d.images} images, all described.`, null, 0);
    }
  }

  // The gap between what a page is about and where it says so. This is the
  // check that finds pages ranking for nothing despite being well written.
  if (d.keywords.measurable) {
    risk(6);
    const { primary, terms, missedEverywhere, missesPrimary } = d.keywords;
    if (missedEverywhere.length === terms.length && terms.length > 1) {
      add(
        "warning",
        "Content",
        "None of your main terms appear in the title, H1 or description",
        `The page is plainly about “${terms[0].term}” and “${terms[1].term}”, and neither turns up in any of the three places a search engine weighs most. This is the shape of a page that reads well and ranks for nothing.`,
        "Rewrite the title, H1 and description around the terms the page is actually about — or change the copy if those aren't the terms you want.",
        6
      );
    } else if (missesPrimary) {
      add(
        "warning",
        "Content",
        `“${primary.term}” never appears in your title, H1 or description`,
        `It is the most-used term on the page — ${primary.count} times — so it is plainly what this page is about, and nothing above the fold says so.`,
        "Work the term into the title or H1 if it's one you want to rank for.",
        4
      );
    } else {
      add(
        "good",
        "Content",
        "Your main terms appear where they count",
        terms
          .filter((t) => t.inTitle || t.inH1 || t.inDescription)
          .slice(0, 3)
          .map((t) => `“${t.term}”`)
          .join(", "),
        null,
        0
      );
    }
  }

  risk(3);
  if (d.textRatio < T.textRatioMin && d.wordCount > 0) {
    add("warning", "Content", `Only ${d.textRatio}% of the page is readable text`, "The rest is markup and inline code. It still parses, but it means a lot of bytes are being shipped for very little content, on every single visit.", "Move the bulk out to cacheable files so the document itself is mostly words.", 3);
  }

  risk(2);
  if (d.deprecated.length) {
    add("warning", "Content", `Deprecated HTML in use: ${d.deprecated.map((t) => `<${t.tag}>`).join(", ")}`, "These tags were dropped from HTML years ago. Browsers still render most of them, but their presence usually means the page has not been touched in a long time — and search engines read staleness from more than the copy.", "Replace them with CSS and current elements.", 2);
  }

  // — Performance (measured, not modelled) —
  risk(10);
  if (d.elapsedMs > T.responseCriticalMs) {
    add("critical", "Performance", `Homepage took ${(d.elapsedMs / 1000).toFixed(1)}s to respond`, "Slow first response costs you both rankings and visitors who leave before it paints.", "Find what's blocking the initial response — hosting, redirects or server-side work.", 10);
  } else if (d.elapsedMs > T.responseWarningMs) {
    add("warning", "Performance", `Homepage responded in ${(d.elapsedMs / 1000).toFixed(1)}s`, "Slower than it should be. Speed is a ranking input and a conversion one.", "Trim the time to first byte — caching or a CDN usually does it.", 5);
  } else {
    add("good", "Performance", `Responded in ${(d.elapsedMs / 1000).toFixed(2)}s`, "Quick first response.", null, 0);
  }

  // We asked for gzip and brotli by name, so a plain answer is the server's
  // choice rather than an omission on our side.
  risk(5);
  if (!d.compression) {
    add("warning", "Performance", "The page is served uncompressed", `${d.htmlKb} KB of HTML went over the wire as-is. We asked for gzip and brotli; the server sent neither. Text compresses by roughly three quarters, so this is the cheapest speed win available.`, "Turn on compression at the server or CDN. It is a configuration line, not a code change.", 5);
  } else {
    add("good", "Performance", `Compressed with ${d.compression}`, "Text is being shipped at a fraction of its size.", null, 0);
  }

  risk(4);
  if (d.scripts > T.scripts) {
    add("warning", "Performance", `${d.scripts} script tags on one page`, "Each one is work the browser has to do before the page is usable.", "Audit what's actually needed and defer or drop the rest.", 4);
  } else {
    add("good", "Performance", `${d.scripts} script tags`, "Within a sensible budget.", null, 0);
  }

  risk(4);
  if (d.blockingScripts > T.blockingScripts) {
    add("warning", "Performance", `${d.blockingScripts} scripts in the head block rendering`, "Each of these has to be fetched and run before the browser draws anything at all, so the page stays blank while they load.", "Add defer or async, or move them to the end of the body.", 4);
  }

  if (d.imageDims.total > 0) {
    risk(3);
    if (d.imageDims.missing / d.imageDims.total > T.dimsMissingPct / 100) {
      add("warning", "Performance", `${d.imageDims.missing} of ${d.imageDims.total} images have no width and height`, "The browser cannot reserve space for them, so the layout jumps as each one arrives. That shift is measured by Core Web Vitals and it's the thing that makes people tap the wrong link.", "Set width and height attributes on every image so the space is reserved before it loads.", 3);
    } else {
      add("good", "Performance", "Images declare their dimensions", "The layout won't jump as they load.", null, 0);
    }
  }

  risk(3);
  if (d.domElements > T.domElements) {
    add("warning", "Performance", `~${d.domElements.toLocaleString()} elements in the document`, "A DOM this large is slow to parse, slow to style and slow to change, on every device that isn't yours.", "Reduce the nesting and paginate or lazily render the long lists.", 3);
  }

  // — Security. Not SEO, but it is on the same page and it is measurable. —
  if (d.https) {
    risk(4);
    if (!d.headers.hsts) {
      add("warning", "Security", "No HSTS header", "Without it, the first visit of the day can still be made over plain http before any redirect fires, and that request is interceptable.", "Set Strict-Transport-Security once the https:// site is known good. Hand this line to whoever runs the server.", 4);
    } else {
      add("good", "Security", "HSTS enabled", "Browsers will refuse to talk to this site unencrypted.", null, 0);
    }

    risk(10);
    if (d.mixedContent.length) {
      add(
        "critical",
        "Security",
        `${d.mixedContent.length} resource${d.mixedContent.length === 1 ? "" : "s"} loaded over plain http on an https page`,
        `Browsers block or downgrade these outright, so part of the page is simply missing for every visitor — starting with ${d.mixedContent[0].slice(0, 70)}.`,
        "Switch those URLs to https:// — nearly always just the scheme, same host, same path.",
        10
      );
    } else {
      add("good", "Security", "No mixed content", "Everything the page loads comes over https.", null, 0);
    }
  }

  risk(3);
  const missingHeaders = d.headers.missing;
  if (missingHeaders.length) {
    add("warning", "Security", `Missing security headers: ${missingHeaders.join(", ")}`, "Each of these is one line of server configuration that closes off a class of attack — content sniffing, clickjacking, and leaking the page you came from to every site you link to.", "Set them at the server or CDN. Hand this list to whoever runs it.", 3);
  } else {
    add("good", "Security", "Security headers set", "Sniffing, framing and referrer leakage are all closed off.", null, 0);
  }

  risk(2);
  if (d.headers.signature) {
    add("warning", "Security", `The server announces its version: ${d.headers.signature}`, "Every response tells a scanner exactly which software and which release you run, which is how a known vulnerability finds its way to you rather than being looked for.", "Suppress the Server and X-Powered-By version strings in the server config.", 2);
  }

  risk(2);
  if (d.emails.length) {
    add("warning", "Security", `${d.emails.length} email address${d.emails.length === 1 ? "" : "es"} in the page source`, `${d.emails[0]} is sitting in the HTML in plain text. Harvesters read HTML, so this address is on spam lists — that is the whole mechanism.`, "Put a contact form there instead, or obfuscate the address in the markup.", 2);
  }

  const penalty = f.reduce((sum, x) => sum + (x.weight || 0), 0);
  const normalised = maxPenalty > 0 ? Math.round(100 * (1 - penalty / maxPenalty)) : 100;
  // Two ceilings: the blockers declared above, and how many findings are
  // actively costing this page traffic. See criticalCeiling().
  const criticals = f.filter((x) => x.severity === "critical").length;
  const capped = Math.min(ceiling, criticalCeiling(criticals), normalised);
  return { findings: f, score: Math.max(SCORE_FLOOR, capped) };
}

// A single-fetch snapshot of a page's observable surface. Comparing two of
// these over time is real change detection — no ranking data source needed.
export async function runSnapshot(input) {
  const target = normalizeUrl(input);
  await assertPublicHost(target.hostname);
  const res = await safeFetch(target.toString(), { timeoutMs: 9000 });
  if (!res.ok) {
    const err = new Error(`status ${res.status}`);
    err.code = "bad_status";
    err.status = res.status;
    throw err;
  }
  const html = res.body;
  const base = res.finalUrl;
  const links = linkStats(html, base);

  return {
    url: target.toString(),
    finalUrl: base,
    title: first(html, /<title[^>]*>([^<]*)<\/title>/i) || null,
    description: metaContent(html, "description") || null,
    wordCount: visibleWordCount(html),
    schemaTypes: schemaTypes(html),
    h1: first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim() || null,
    h2Count: countMatches(html, /<h2\b/gi),
    images: countMatches(html, /<img\b/gi),
    distinctPages: links.distinctPages,
    paths: [...new Set(links.internalUrls.map((u) => new URL(u).pathname.replace(/\/$/, "") || "/"))]
      .filter((p) => p !== "/")
      .slice(0, 60),
    htmlKb: Math.round(res.bytes / 1024),
    responseMs: res.elapsedMs,
  };
}

/**
 * Reads the security, compression and indexing headers off the main response.
 *
 * Kept apart from buildFindings so that function stays a pure verdict over
 * plain data — which is what makes it testable without a network.
 */
function readHeaders(res) {
  const get = (name) => {
    try {
      return res.headers?.get?.(name) || null;
    } catch {
      return null;
    }
  };
  const csp = get("content-security-policy") || "";
  const missing = [];
  if (!get("x-content-type-options")) missing.push("X-Content-Type-Options");
  // frame-ancestors in a CSP supersedes X-Frame-Options, so either counts.
  if (!get("x-frame-options") && !/frame-ancestors/i.test(csp)) missing.push("X-Frame-Options");
  if (!get("referrer-policy")) missing.push("Referrer-Policy");

  const server = get("server") || "";
  const powered = get("x-powered-by") || "";
  // A bare product name gives nothing away; a version number does.
  const signature = [server, powered].filter((v) => /\d/.test(v)).join(", ") || null;

  return {
    hsts: get("strict-transport-security"),
    contentEncoding: get("content-encoding"),
    xRobots: get("x-robots-tag"),
    missing,
    signature,
  };
}

export async function runAudit(input, { adsense = false } = {}) {
  const target = normalizeUrl(input);
  await assertPublicHost(target.hostname);

  // 1.2 MB rather than the 400 KB default. A marketing homepage above 400 KB
  // of HTML is ordinary, and the cap used to cut the footer off — which is
  // where the privacy policy, the terms and half the internal links live. The
  // report was then confidently wrong about all three.
  const main = await safeFetch(target.toString(), { timeoutMs: 9000, capBytes: 1_200_000 });
  if (!main.ok) {
    const err = new Error(`status ${main.status}`);
    err.code = "bad_status";
    err.status = main.status;
    throw err;
  }

  const html = main.body;
  const base = main.finalUrl;
  const origin = new URL(base).origin;
  const isHttps = new URL(base).protocol === "https:";

  // Everything else the report needs, in parallel. Each one degrades to "not
  // measured" rather than failing the audit, so one uncooperative endpoint
  // can't cost you the whole report.
  const [robotsRes, sitemapRes, httpRes, probeRes, adsTxtRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { timeoutMs: 4500, capBytes: 40_000 }).catch(() => null),
    safeFetch(`${origin}/sitemap.xml`, { timeoutMs: 4500, capBytes: 120_000 }).catch(() => null),
    // Only worth asking when the site answered on https: if it is http-only
    // the main finding already says so.
    isHttps
      ? safeFetch(`http://${new URL(base).host}/`, { timeoutMs: 4500, capBytes: 2_000 }).catch(() => null)
      : Promise.resolve(null),
    safeFetch(`${origin}${NOT_FOUND_PROBE}`, { timeoutMs: 4500, capBytes: 2_000 }).catch(() => null),
    adsense
      ? safeFetch(`${origin}/ads.txt`, { timeoutMs: 4500, capBytes: 40_000 }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const robotsBody = robotsRes?.ok ? robotsRes.body : "";
  const robots = {
    exists: !!robotsRes?.ok,
    hasSitemap: sitemapsIn(robotsBody).length > 0,
    blocksAll: disallowsEverything(robotsBody, "*"),
  };

  const sitemapBody = sitemapRes?.ok ? sitemapRes.body : "";
  const looksLikeSitemap = /<(urlset|sitemapindex)/i.test(sitemapBody);
  const sitemap = {
    exists: !!sitemapRes?.ok && looksLikeSitemap,
    urlCount: looksLikeSitemap ? countMatches(sitemapBody, /<loc>/gi) : 0,
  };

  const httpRedirect = httpRes
    ? { checked: true, toHttps: new URL(httpRes.finalUrl).protocol === "https:" }
    : { checked: false, toHttps: null };

  // 404 and 410 are both correct answers to "this does not exist". Anything
  // else that isn't 200 — a 403 from a bot wall, say — tells us nothing, so
  // no finding is made rather than a guess.
  const notFound = probeRes
    ? probeRes.status === 200
      ? { checked: true, soft: true, status: 200 }
      : [404, 410].includes(probeRes.status)
      ? { checked: true, soft: false, status: probeRes.status }
      : { checked: false, soft: null, status: probeRes.status }
    : { checked: false, soft: null, status: null };

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imagesMissingAlt = imgTags.filter((t) => !/\balt\s*=\s*["'][^"']*[^"'\s][^"']*["']/i.test(t)).length;
  const headers = readHeaders(main);
  const robotsMeta = metaContent(html, "robots") || metaContent(html, "googlebot") || "";
  const robotsDirectives = `${robotsMeta} ${headers.xRobots || ""}`.toLowerCase();
  const title = first(html, /<title[^>]*>([^<]*)<\/title>/i);
  const h1Text = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim();
  const description = metaContent(html, "description");
  const wordCount = visibleWordCount(html);
  const links = linkStats(html, base);
  const viewport = !!metaContent(html, "viewport");
  const lang = first(html, /<html[^>]+lang=["']([^"']+)["']/i);

  const data = {
    url: target.toString(),
    finalUrl: base,
    https: isHttps,
    title,
    description,
    lang,
    viewport,
    charset: charsetOf(html, main.contentType),
    canonical: first(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i),
    ogTitle: propContent(html, "og:title"),
    ogDescription: propContent(html, "og:description"),
    ogImage: propContent(html, "og:image"),
    twitter: twitterCardTags(html),
    social: socialProfiles(html, base),
    analytics: analyticsTools(html),
    faviconUrl: extractIcon(html, base),
    h1Count: countMatches(html, /<h1\b/gi),
    h1: h1Text || null,
    headings: headingOutline(html),
    images: imgTags.length,
    imagesMissingAlt,
    imageDims: imagesMissingDimensions(html),
    scripts: countMatches(html, /<script\b/gi),
    blockingScripts: blockingHeadScripts(html),
    stylesheets: countMatches(html, /<link[^>]+rel=["']stylesheet["']/gi),
    domElements: domElementCount(html),
    textRatio: textToHtmlRatio(html),
    deprecated: deprecatedTags(html),
    emails: plaintextEmails(html),
    mixedContent: isHttps ? mixedContentUrls(html) : [],
    wordCount,
    schemaTypes: schemaTypes(html),
    keywords: keywordConsistency(html, { title, description, h1: h1Text }),
    links,
    htmlKb: Math.round(main.bytes / 1024),
    truncated: !!main.truncated,
    elapsedMs: main.elapsedMs,
    compression: headers.contentEncoding,
    headers,
    noindex: /\bnoindex\b/.test(robotsDirectives),
    nofollow: /\bnofollow\b/.test(robotsDirectives),
    noindexFrom: /\bnoindex\b/.test(String(headers.xRobots || "").toLowerCase()) ? "header" : "meta",
    noindexValue: (robotsMeta || headers.xRobots || "").trim(),
    robots,
    sitemap,
    httpRedirect,
    notFound,
  };

  const { findings, score } = buildFindings(data);

  const criticals = findings.filter((x) => x.severity === "critical");
  const warnings = findings.filter((x) => x.severity === "warning");
  const good = findings.filter((x) => x.severity === "good");

  const result = {
    ok: true,
    url: data.url,
    finalUrl: data.finalUrl,
    title: data.title || null,
    description: data.description || null,
    faviconUrl: data.faviconUrl,
    score,
    counts: { critical: criticals.length, warning: warnings.length, good: good.length },
    findings: [...criticals, ...warnings, ...good].map(({ weight, ...rest }) => rest),
    stats: {
      wordCount: data.wordCount,
      images: data.images,
      imagesMissingAlt: data.imagesMissingAlt,
      imagesMissingDims: data.imageDims.missing,
      internalLinks: data.links.internal,
      externalLinks: data.links.external,
      anchorLinks: data.links.anchors,
      distinctPages: data.links.distinctPages,
      h1: data.h1Count,
      h2: data.headings.counts.h2,
      scripts: data.scripts,
      blockingScripts: data.blockingScripts,
      stylesheets: data.stylesheets,
      domElements: data.domElements,
      textRatio: data.textRatio,
      htmlKb: data.htmlKb,
      responseMs: data.elapsedMs,
      compression: data.compression,
      schemaTypes: data.schemaTypes,
      sitemapUrls: data.sitemap.urlCount,
      analytics: data.analytics,
      social: data.social.map((s) => s.network),
      twitterCard: data.twitter.card || null,
      charset: data.charset.value,
      keywords: data.keywords.terms,
      securityHeadersMissing: data.headers.missing,
      emails: data.emails.length,
      mixedContent: data.mixedContent.length,
      httpsRedirect: data.httpRedirect.toHttps,
      notFoundOk: data.notFound.checked ? !data.notFound.soft : null,
      noindex: data.noindex,
    },
  };

  if (adsense) {
    result.adsense = buildAdsenseReport({
      html,
      base,
      https: isHttps,
      viewport,
      lang,
      wordCount,
      distinctPages: links.distinctPages,
      sitemapUrls: sitemap.urlCount,
      robots,
      robotsBody,
      truncated: !!main.truncated,
      htmlKb: Math.round(main.bytes / 1024),
      adsTxt: adsTxtRes?.ok ? { exists: true, body: adsTxtRes.body } : { exists: false, body: "" },
    });
  }

  return result;
}
