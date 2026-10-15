// Shared HTML extraction. Both the single-page audit and the multi-page
// crawler parse the same way, so a finding means the same thing wherever it
// was produced.
//
// Every page parsed here was written by somebody else, often by whoever is
// pointing a public endpoint at us. Anything that reads tags or attributes goes
// through lib/htmlTags.js rather than a regex with [^>]+ in it: those patterns
// took 87 seconds on 60 KB of hostile markup. tests/redos.test.mjs holds every
// export here to a time budget on 1.2 MB of it.

import { startTags, elements, removeBlocks } from "./htmlTags";

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

export function decodeEntities(str) {
  return String(str ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function first(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
}

export function countMatches(html, re) {
  const m = html.match(re);
  return m ? m.length : 0;
}

/** An attribute value as the old extractors returned it: collapsed and decoded. */
function clean(value) {
  return decodeEntities(String(value ?? "").replace(/\s+/g, " ").trim());
}

/** The content of the first <meta> whose `attr` equals `key`, ignoring case. */
function metaBy(html, attr, key) {
  const want = String(key).toLowerCase();
  const tag = startTags(html, "meta").find(
    (t) => String(t.attrs[attr] ?? "").toLowerCase() === want && t.attrs.content !== undefined
  );
  return tag ? clean(tag.attrs.content) : "";
}

export function metaContent(html, name) {
  return metaBy(html, "name", name);
}

export function propContent(html, prop) {
  return metaBy(html, "property", prop);
}

/**
 * Removes every tag, in one pass that cannot restart: [^<>] stops at the next
 * "<", so each character is read by at most one attempt. A bare "<" in text
 * survives as text rather than swallowing everything up to the next ">".
 */
export function stripTags(html, replacement = " ") {
  return String(html).replace(/<[^<>]+>/g, replacement);
}

export function visibleText(html) {
  let out = removeBlocks(html, /<script/, /<\/script>/);
  out = removeBlocks(out, /<style/, /<\/style>/);
  out = removeBlocks(out, /<noscript/, /<\/noscript>/);
  out = removeBlocks(out, /<!--/, /-->/);
  return stripTags(out)
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The document title, as long as nothing but text sits inside it. */
export function titleOf(html) {
  for (const el of elements(html, "title", { limit: 50 })) {
    if (el.inner !== null && !el.inner.includes("<")) return clean(el.inner);
  }
  return "";
}

/** The text of the first H1, tags and all removed. */
export function h1Of(html) {
  const el = elements(html, "h1", { limit: 50 }).find((e) => e.inner !== null);
  return el ? stripTags(clean(el.inner), "").trim() : "";
}

/** The <html lang>. */
export function htmlLang(html) {
  const tag = startTags(html, "html", { limit: 5 }).find((t) => t.attrs.lang);
  return tag ? clean(tag.attrs.lang) : "";
}

const relIs = (tag, ...values) => values.includes(String(tag.attrs.rel ?? "").trim().toLowerCase());

/** The <link rel="canonical"> href. */
export function canonicalOf(html) {
  const tag = startTags(html, "link").find((t) => relIs(t, "canonical") && t.attrs.href);
  return tag ? clean(tag.attrs.href) : "";
}

/** Every <img> start tag, raw, for counting and attribute checks. */
export function imgTags(html) {
  return startTags(html, "img");
}

/** How many <link rel="stylesheet"> the page loads. */
export function stylesheetCount(html) {
  return startTags(html, "link").filter((t) => relIs(t, "stylesheet")).length;
}

/** An <img> with alt text that says something. alt="" is a deliberate choice, but not a description. */
export function hasMeaningfulAlt(tag) {
  return String(tag.attrs.alt ?? "").replace(/["']/g, "").trim().length > 0;
}

export function visibleWordCount(html) {
  const t = visibleText(html);
  return t ? t.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length : 0;
}

export function schemaTypes(html) {
  const types = new Set();
  const blocks = elements(html, "script").filter(
    (el) => el.inner !== null && /application\/ld\+json/i.test(el.raw)
  );
  blocks.forEach(({ inner }) => {
    (inner.match(/"@type"\s*:\s*"([^"]+)"/g) || []).forEach((f) => {
      const t = f.match(/"@type"\s*:\s*"([^"]+)"/);
      if (t) types.add(t[1]);
    });
  });
  return [...types];
}

export function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Strips the fragment and normalizes the trailing slash so the crawler doesn't
// visit the same page twice under two spellings.
export function canonicalizeUrl(raw, base) {
  const abs = absolutize(raw, base);
  if (!abs) return null;
  try {
    const u = new URL(abs);
    u.hash = "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

export function linkStats(html, baseUrl) {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const hrefs = anchorHrefs(html);
  let internal = 0;
  let external = 0;
  let anchors = 0;
  const internalUrls = new Set();
  const internalPaths = new Set();
  hrefs.forEach((h) => {
    if (/^(mailto:|tel:|javascript:|#)/i.test(h)) {
      if (h.startsWith("#")) anchors += 1;
      return;
    }
    const abs = canonicalizeUrl(h, baseUrl);
    if (!abs) return;
    try {
      const u = new URL(abs);
      if (!/^https?:$/.test(u.protocol)) return;
      if (u.hostname.replace(/^www\./, "") === host) {
        internal += 1;
        internalUrls.add(abs);
        internalPaths.add(u.pathname.replace(/\/$/, "") || "/");
      } else {
        external += 1;
      }
    } catch {
      /* ignore */
    }
  });
  return {
    internal,
    external,
    anchors,
    internalUrls: [...internalUrls],
    distinctPages: [...internalPaths].filter((p) => p !== "/").length,
    total: internal + external,
  };
}

/** Every non-empty <a href>, raw, in document order. */
function anchorHrefs(html) {
  return startTags(html, "a")
    .map((t) => t.attrs.href)
    .filter((h) => typeof h === "string" && h.length > 0);
}

export function extractIcon(html, base) {
  const links = startTags(html, "link").filter((t) => t.attrs.href);
  const icon =
    links.find((t) => relIs(t, "icon", "shortcut icon")) || links.find((t) => relIs(t, "apple-touch-icon"));
  const href = icon ? clean(icon.attrs.href) : "";
  return href ? absolutize(href, base) : absolutize("/favicon.ico", base);
}

// One page's observable surface — the unit the crawler stores per URL.
export function parsePage(html, finalUrl, meta = {}) {
  const images = imgTags(html);
  const links = linkStats(html, finalUrl);
  let path = "/";
  try {
    path = new URL(finalUrl).pathname || "/";
  } catch {
    /* keep default */
  }
  return {
    url: finalUrl,
    path,
    status: meta.status ?? 200,
    title: titleOf(html) || null,
    description: metaContent(html, "description") || null,
    h1: h1Of(html) || null,
    h1Count: countMatches(html, /<h1\b/gi),
    h2Count: countMatches(html, /<h2\b/gi),
    h3Count: countMatches(html, /<h3\b/gi),
    canonical: canonicalOf(html) || null,
    robotsMeta: metaContent(html, "robots") || null,
    ogTitle: propContent(html, "og:title") || null,
    ogImage: propContent(html, "og:image") || null,
    viewport: !!metaContent(html, "viewport"),
    lang: htmlLang(html) || null,
    wordCount: visibleWordCount(html),
    schemaTypes: schemaTypes(html),
    images: images.length,
    imagesMissingAlt: images.filter((t) => !hasMeaningfulAlt(t)).length,
    internalLinks: links.internal,
    externalLinks: links.external,
    anchorLinks: links.anchors,
    scripts: countMatches(html, /<script\b/gi),
    htmlKb: Math.round((meta.bytes ?? html.length) / 1024),
    responseMs: meta.elapsedMs ?? null,
    outLinks: links.internalUrls,
  };
}

// ---------------------------------------------------------------------------
// Extra surface the single-page audit reports on.
//
// These live here, beside the parsers the crawler already uses, so a finding
// means the same thing whichever side produced it. Every pattern below is
// deliberately simple — this parses HTML somebody else wrote and handed us, so
// no expression here can backtrack catastrophically on a hostile page.
// ---------------------------------------------------------------------------

/** The declared character set, from the document or, failing that, the header. */
export function charsetOf(html, contentType) {
  const metas = startTags(html, "meta", { limit: 200 });
  const declared = metas.find((t) => /^[a-z0-9_-]+/i.test(t.attrs.charset ?? ""));
  const equiv = metas.find(
    (t) => String(t.attrs["http-equiv"] ?? "").toLowerCase() === "content-type" && /charset=[a-z0-9_-]+/i.test(t.attrs.content ?? "")
  );
  const meta = declared
    ? declared.attrs.charset.match(/^[a-z0-9_-]+/i)[0]
    : equiv
    ? equiv.attrs.content.match(/charset=([a-z0-9_-]+)/i)[1]
    : "";
  if (meta) return { value: meta.toLowerCase(), from: "document" };
  const header = String(contentType || "").match(/charset=([a-z0-9_-]+)/i);
  if (header) return { value: header[1].toLowerCase(), from: "header" };
  return { value: null, from: null };
}

/**
 * The heading outline in document order, and whether it skips levels.
 *
 * A jump from H1 straight to H3 is not a style quibble: assistive technology
 * and every parser that builds a document outline reads the gap as a missing
 * section, so the H3 hangs off nothing.
 */
export function headingOutline(html) {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  levels.forEach((l) => {
    counts[`h${l}`] += 1;
  });
  const skips = [];
  let prev = null;
  levels.forEach((l) => {
    if (prev !== null && l > prev + 1) skips.push({ from: prev, to: l });
    prev = l;
  });
  return { levels, counts, skips, startsAtH1: levels.length === 0 ? null : levels[0] === 1 };
}

const SOCIAL_HOSTS = [
  ["Facebook", /(?:^|\.)facebook\.com$/i],
  ["Instagram", /(?:^|\.)instagram\.com$/i],
  ["X", /(?:^|\.)(?:twitter|x)\.com$/i],
  ["LinkedIn", /(?:^|\.)linkedin\.com$/i],
  ["YouTube", /(?:^|\.)(?:youtube\.com|youtu\.be)$/i],
  ["TikTok", /(?:^|\.)tiktok\.com$/i],
  ["Pinterest", /(?:^|\.)pinterest\.(?:com|[a-z]{2})$/i],
  ["GitHub", /(?:^|\.)github\.com$/i],
  ["Threads", /(?:^|\.)threads\.(?:net|com)$/i],
];

// A share button is not a profile. facebook.com/sharer, x.com/intent/tweet and
// friends point back at the visitor's own account, so counting them as "you
// have a Facebook page" would be reporting something untrue.
const SHARE_PATHS = /^\/(?:sharer|share|share_channel|intent|shareArticle|dialog|submit|pin\/create)/i;

/** Which social profiles this page actually links out to. */
export function socialProfiles(html, baseUrl) {
  const found = new Map();
  anchorHrefs(html).forEach((href) => {
    const abs = absolutize(href, baseUrl);
    if (!abs) return;
    let u;
    try {
      u = new URL(abs);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    if (SHARE_PATHS.test(u.pathname)) return;
    const hit = SOCIAL_HOSTS.find(([, re]) => re.test(u.hostname));
    // A bare link to the platform's front door is not a profile either.
    if (!hit || u.pathname.replace(/\/+$/, "") === "") return;
    if (!found.has(hit[0])) found.set(hit[0], abs);
  });
  return [...found].map(([network, url]) => ({ network, url }));
}

const ANALYTICS = [
  ["Google Analytics 4", /googletagmanager\.com\/gtag\/js|gtag\(["']config["'],\s*["']G-/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|["']GTM-[A-Z0-9]{4,}["']/],
  ["Universal Analytics", /google-analytics\.com\/(?:analytics|ga)\.js|["']UA-\d{4,}-\d+["']/],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']{0,60}\/fbevents\.js/i],
  ["Plausible", /plausible\.io\/js/i],
  ["Fathom", /usefathom\.com/i],
  ["Umami", /cloud\.umami\.is|\/umami(?:\.\w+)?\.js/i],
  ["Matomo", /matomo\.js|piwik\.js|matomo\.cloud/i],
  ["Microsoft Clarity", /clarity\.ms/i],
  ["Hotjar", /static\.hotjar\.com/i],
  ["Vercel Analytics", /\/_vercel\/insights/i],
  ["Bing UET", /bat\.bing\.com/i],
  ["LinkedIn Insight", /snap\.licdn\.com/i],
  ["PostHog", /posthog\.com\/static\/array\.js|posthog\.init\(/i],
  ["Cloudflare Insights", /static\.cloudflareinsights\.com/i],
];

/** Which measurement tools are wired into the page. */
export function analyticsTools(html) {
  return ANALYTICS.filter(([, re]) => re.test(html)).map(([name]) => name);
}

const DEPRECATED = ["font", "center", "marquee", "blink", "big", "strike", "tt", "frameset", "frame", "applet"];

/** Tags HTML dropped a decade or more ago, with how many of each are present. */
export function deprecatedTags(html) {
  return DEPRECATED.map((tag) => ({ tag, count: countMatches(html, new RegExp(`<${tag}\\b`, "gi")) })).filter(
    (t) => t.count > 0
  );
}

/** Rough element count — enough to tell a page from a document. */
export function domElementCount(html) {
  return countMatches(html, /<[a-z][a-z0-9-]*[\s/>]/gi);
}

/**
 * Email addresses sitting in the source as plain text.
 *
 * Harvesters read HTML, so an address written out in a mailto: or in the copy
 * is an address on a spam list. Reporting it is not moralising about privacy:
 * it is one of the few things on a page that costs the owner real time.
 */
export function plaintextEmails(html) {
  const out = new Set();
  // Anchored on each "@" and read outwards a bounded distance, rather than a
  // pattern that starts at every letter: [a-z0-9._%+-]+@ re-reads a long run
  // of letters from each of its positions looking for an @ that never comes.
  // 64 and 253 are the RFC limits for the two halves of an address.
  const LOCAL = /[a-z0-9._%+-]/i;
  const DOMAIN = /[a-z0-9.-]/i;
  const at = /@/g;
  let m;
  let seen = 0;
  while ((m = at.exec(html)) && out.size < 12 && seen < 5000) {
    seen += 1;
    let s = m.index;
    while (s > 0 && m.index - s < 64 && LOCAL.test(html[s - 1])) s -= 1;
    if (s === m.index) continue;
    let e = m.index + 1;
    while (e < html.length && e - m.index <= 253 && DOMAIN.test(html[e])) e += 1;
    const domain = html.slice(m.index + 1, e).match(/^[a-z0-9.-]*\.[a-z]{2,}/i);
    if (!domain) continue;
    const address = `${html.slice(s, m.index)}@${domain[0]}`;
    // Filenames and CSS urls can look like an address; a real one does not end
    // in an asset extension.
    if (/\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i.test(address)) continue;
    out.add(address.toLowerCase());
  }
  return [...out];
}

/**
 * Subresources loaded over plain HTTP by an HTTPS page.
 *
 * Anchors are excluded on purpose: linking out to an http:// site is untidy,
 * not broken. A stylesheet, script, image or frame is different — the browser
 * blocks or downgrades it, so the page is measurably damaged.
 */
export function mixedContentUrls(html) {
  const out = new Set();
  const insecure = (v) => typeof v === "string" && /^http:\/\//i.test(v);
  startTags(html, "script|img|iframe|source|video|audio").forEach((t) => {
    if (insecure(t.attrs.src)) out.add(t.attrs.src);
  });
  startTags(html, "link").forEach((t) => {
    if (relIs(t, "stylesheet") && insecure(t.attrs.href)) out.add(t.attrs.href);
  });
  return [...out].slice(0, 12);
}

/** Share of the delivered bytes that is actually readable copy. */
export function textToHtmlRatio(html) {
  const total = html.length || 1;
  return Math.round((visibleText(html).length / total) * 1000) / 10;
}

// Words that carry no topic. Trimmed to the ones that actually crowd out a
// term list; a full stopword corpus would be its own dependency.
const STOPWORDS = new Set(
  (
    "about above after again against all also and any are because been before being below between both but can come could " +
    "did does doing don down during each few for from further get got had has have having her here hers him his how into " +
    "its just like made make may might more most much must new not now off once only other our ours out over own said same " +
    "see she should some such than that the their theirs them then there these they this those through too under until use " +
    "used using very was way well were what when where which while who whom why will with within would you your yours"
  ).split(" ")
);

/**
 * Drops link labels that repeat across the page.
 *
 * Without this the term list on any card-based marketing page is its call to
 * action: Stripe's homepage says "Read story" twelve times, so "read story"
 * outranks "financial infrastructure" and the report announces that the page
 * has failed to put its main term in the title. The term was never a term.
 * Repeated identical anchor text is interface, not topic.
 */
function stripRepeatedLinkLabels(html) {
  const anchors = elements(html, "a", { maxInner: 300 }).filter((a) => a.inner !== null);
  const labels = new Map();
  anchors.forEach((a) => {
    a.label = visibleText(a.inner).toLowerCase();
    if (a.label && a.label.length < 60) labels.set(a.label, (labels.get(a.label) || 0) + 1);
  });
  const boilerplate = new Set([...labels].filter(([, n]) => n >= 4).map(([label]) => label));
  if (!boilerplate.size) return html;
  let out = "";
  let pos = 0;
  anchors.forEach((a) => {
    if (!boilerplate.has(a.label)) return;
    out += html.slice(pos, a.start) + " ";
    pos = a.end;
  });
  return out + html.slice(pos);
}

/**
 * The terms this page is actually about, and whether the page says so where it
 * counts.
 *
 * A page can repeat a phrase forty times in the body and never put it in the
 * title, the H1 or the description — the three places a search engine weighs
 * most. That gap is the finding.
 */
export function keywordConsistency(html, { title, description, h1 } = {}) {
  // Split on punctuation first, so a phrase can never straddle a sentence
  // boundary, and build the two-word phrases from adjacent tokens BEFORE
  // stopwords are dropped.
  //
  // Doing it the other way round invents phrases the page never says: filter
  // "the" out of "Stripe. Read the story" and the bigrams become "stripe read"
  // and "read story", which then topped the term list for stripe.com and had
  // the report telling them their main term was missing from their own title.
  // A phrase is only a phrase if the words were next to each other.
  const segments = visibleText(stripRepeatedLinkLabels(html))
    .toLowerCase()
    .split(/[^a-z0-9\s'’-]+/);

  const unigrams = new Map();
  const bigrams = new Map();
  let tokenCount = 0;

  const topical = (t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t);

  segments.forEach((segment) => {
    const tokens = segment
      .split(/\s+/)
      .map((t) => t.replace(/^['’-]+|['’-]+$/g, ""))
      .filter(Boolean);
    tokenCount += tokens.length;

    tokens.forEach((t) => {
      if (topical(t)) unigrams.set(t, (unigrams.get(t) || 0) + 1);
    });
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (!topical(a) || !topical(b)) continue;
      // "widgets widgets" is not a phrase anybody searches for; it is a word
      // that happened to land next to itself.
      if (a === b) continue;
      const phrase = `${a} ${b}`;
      bigrams.set(phrase, (bigrams.get(phrase) || 0) + 1);
    }
  });

  const inText = (hay, needle) => String(hay || "").toLowerCase().includes(needle);
  const rank = (map, min) =>
    [...map]
      .filter(([, n]) => n >= min)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([term, count]) => ({
        term,
        count,
        inTitle: inText(title, term),
        inDescription: inText(description, term),
        inH1: inText(h1, term),
      }));

  // Phrases first: they are the terms people actually search for, and a page
  // that covers the phrase covers both of its words.
  const phrases = rank(bigrams, 3);
  const singles = rank(unigrams, 3).filter((s) => !phrases.some((p) => p.term.includes(s.term)));
  const terms = [...phrases, ...singles].slice(0, 6);

  // The verdict rests on the page's STRONGEST term, not on any term in the
  // list. A page whose most-used term is in its title is doing the job; that
  // its fourth-most-used term is not there is a preference, not a fault, and
  // reporting it as one is how a report loses its credibility.
  const missed = (t) => !t.inTitle && !t.inDescription && !t.inH1;
  const primary = terms.reduce((best, t) => (!best || t.count > best.count ? t : best), null);

  return {
    terms,
    primary,
    // Only judge a page with enough copy to have a topic at all.
    measurable: tokenCount >= 80 && terms.length > 0,
    missesPrimary: !!primary && missed(primary),
    missedEverywhere: terms.filter(missed),
  };
}

/** Images with no width/height attributes — the classic layout-shift cause. */
export function imagesMissingDimensions(html) {
  const tags = imgTags(html);
  const missing = tags.filter((t) => !("width" in t.attrs && "height" in t.attrs));
  return { total: tags.length, missing: missing.length };
}

/** External scripts in <head> with neither async nor defer — they block paint. */
export function blockingHeadScripts(html) {
  const head = elements(html, "head", { limit: 1 })[0];
  if (!head || head.inner === null) return 0;
  return startTags(head.inner, "script").filter(
    (t) =>
      "src" in t.attrs &&
      !("async" in t.attrs) &&
      !("defer" in t.attrs) &&
      String(t.attrs.type ?? "").toLowerCase() !== "module"
  ).length;
}

/** The Twitter/X card tags, which some sites set with property= rather than name=. */
export function twitterCardTags(html) {
  const read = (n) => metaContent(html, n) || propContent(html, n);
  return {
    card: read("twitter:card"),
    title: read("twitter:title"),
    description: read("twitter:description"),
    image: read("twitter:image") || read("twitter:image:src"),
  };
}

// The pages an advertising network — and a buyer — expects a real business to
// have.
//
// Two passes, because neither alone is enough. Matching the URL misses sites
// that route these through /p/12; matching the link text misses anchors with a
// page of markup inside them, and misses the footer entirely on any site whose
// document is too big to read in full.
//
// The URL patterns are anchored to a whole path segment on purpose. A loose
// `/privacy/` substring test marks /blog/privacy-first-analytics as a privacy
// policy, and the AdSense section treats a missing privacy policy as a
// critical finding — so a sloppy match here becomes a confident lie there.
const POLICY_PAGES = [
  {
    key: "privacy",
    // Last segment: an optional prefix, the word, an optional policy suffix.
    slug: /^(?:[a-z0-9]+[-_])*(?:privacy|datenschutz\w*|confidentialite|privacidad)(?:[-_]?(?:policy|policies|notice|statement|beleid))?$/i,
    // Any segment, matched exactly. Safe from false positives, so it can be
    // used on a path of any depth.
    exact: ["privacy", "privacy-policy", "privacypolicy", "datenschutz", "privacidad"],
    // Anchored to the whole label. An unanchored /privacy/ matched the link
    // text "Privacy-first analytics" on a blog post, which then satisfied the
    // AdSense section's requirement for a privacy policy the site did not have.
    text: /^privacy(\s*(policy|policies|notice|statement))?$|^datenschutz\w*$|^(aviso de )?privacidad$|^politique de confidentialit\w*$/i,
  },
  {
    key: "terms",
    slug: /^(?:[a-z0-9]+[-_])*(?:terms|tos|conditions|impressum|agb)(?:[-_]?(?:of[-_]?(?:service|use|sale)|and[-_]?conditions|conditions|service|use))?$/i,
    exact: ["terms", "tos", "terms-of-service", "terms-and-conditions", "impressum", "agb"],
    text: /^terms(\s*(of\s*(service|use|sale)|(and|&)\s*conditions))?$|^(tos|conditions|impressum|agb)$/i,
  },
  {
    key: "contact",
    slug: /^(?:[a-z0-9]+[-_])*(?:contact|kontakt|contacto|contatti)(?:[-_]?us)?$/i,
    exact: ["contact", "contact-us", "contactus", "kontakt", "contacto", "get-in-touch"],
    text: /^contact(\s*(us|sales|me))?$|^(kontakt|contacto|contatti)$|^get in touch$/i,
  },
  {
    key: "about",
    slug: /^(?:[a-z0-9]+[-_])*(?:about|company|team)(?:[-_]?(?:us|me))?$/i,
    exact: ["about", "about-us", "aboutus", "company", "our-story", "who-we-are", "ueber-uns"],
    text: /^about(\s*(us|me))?$|^who we are$|^our story$|^(the )?company$/i,
  },
  {
    key: "cookies",
    slug: /^(?:[a-z0-9]+[-_])*cookies?(?:[-_]?(?:policy|policies|notice|settings))?$/i,
    exact: ["cookies", "cookie-policy", "cookies-policy", "cookie-notice"],
    text: /^cookies?(\s*(policy|policies|notice|settings|preferences))?$/i,
  },
];

/** Which policy and trust pages this page links to. */
export function policyLinks(html, baseUrl) {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep empty */
  }
  const found = {};

  const consider = (rawHref, text) => {
    const abs = absolutize(rawHref, baseUrl);
    if (!abs) return;
    let u;
    try {
      u = new URL(abs);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    // Somebody else's privacy policy does not count as yours.
    if (host && u.hostname.replace(/^www\./, "") !== host) return;

    const segments = decodeURIComponent(u.pathname)
      .split("/")
      .map((seg) => seg.replace(/\.(html?|php|aspx?)$/i, "").toLowerCase())
      .filter(Boolean);
    if (!segments.length) return;
    const last = segments[segments.length - 1];
    const label = String(text || "").trim().toLowerCase();

    POLICY_PAGES.forEach((page) => {
      if (found[page.key]) return;
      if (page.slug.test(last) || segments.some((seg) => page.exact.includes(seg)) || (label && label.length < 40 && page.text.test(label))) {
        found[page.key] = abs;
      }
    });
  };

  // Pass one: every href in the document, judged on its path alone.
  [...html.matchAll(/href=["']([^"']+)["']/gi)].forEach((m) => consider(m[1], ""));
  // Pass two: anchor text, for the sites whose URLs give nothing away.
  elements(html, "a", { maxInner: 400 }).forEach((a) => {
    if (a.inner !== null && a.attrs.href) consider(a.attrs.href, visibleText(a.inner));
  });

  return found;
}

// Consent platforms. The Google one is listed first because it is the one that
// matters for AdSense: Google's EU user consent policy requires a CMP from its
// own certified list, and Funding Choices is Google's.
const CMPS = [
  ["Google Funding Choices", /fundingchoicesmessages\.google\.com|googlefc/i],
  ["Cookiebot", /cookiebot\.com|CookieConsent\b/],
  ["OneTrust", /onetrust\.com|otSDKStub|OptanonWrapper/i],
  ["CookieYes", /cookieyes\.com|cookie-law-info/i],
  ["Usercentrics", /usercentrics\.(?:eu|com)/i],
  ["Didomi", /didomi\.io|window\.didomi/i],
  ["Quantcast Choice", /quantcast\.mgr\.consensu|choice\.consentframework|cmp\.quantcast/i],
  ["Sourcepoint", /sourcepoint\.mgr\.consensu|sp-prod\.net/i],
  ["iubenda", /iubenda\.com/i],
  ["Termly", /termly\.io/i],
  ["Osano", /osano\.com/i],
  ["Complianz", /complianz/i],
  ["Axeptio", /axeptio\.(?:eu|io)/i],
  ["Klaro", /klaro(?:-no-css)?\.js/i],
  ["Civic Cookie Control", /cookiecontrol|civiccomputing/i],
  ["consentmanager", /consentmanager\.net/i],
];

/**
 * Consent tooling on the page.
 *
 * `tcfApi` is the strongest single signal — `__tcfapi` is the IAB Transparency
 * and Consent Framework's own entry point, so its presence means a TCF CMP is
 * running whether or not we recognise the vendor. `banner` is the weak
 * fallback: something on the page mentions cookies or consent, which is not
 * the same as a consent platform, and is reported as the weaker thing it is.
 */
export function consentSignals(html) {
  return {
    vendors: CMPS.filter(([, re]) => re.test(html)).map(([name]) => name),
    tcfApi: /__tcfapi\b/.test(html),
    banner: /cookie[- ]?(?:consent|banner|notice|policy)|\bgdpr\b/i.test(html),
  };
}

/**
 * Whether Google AdSense is already on this page, and how.
 *
 * All three surfaces are checked because they fail independently: the loader
 * script with no slots is Auto ads, slots without the loader render nothing at
 * all, and the meta tag is only site verification.
 */
export function adsenseSignals(html) {
  const clients = new Set();
  [...html.matchAll(/ca-pub-(\d{10,25})/g)].forEach((m) => clients.add(`ca-pub-${m[1]}`));
  const verification = metaContent(html, "google-adsense-account");
  if (/^ca-pub-\d{10,25}$/.test(verification)) clients.add(verification);
  return {
    loader: /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/i.test(html),
    slots: startTags(html, "ins").filter((t) => /adsbygoogle/i.test(t.raw)).length,
    clients: [...clients],
    verificationMeta: verification || null,
    // Other networks already on the page. AdSense permits most of them, but it
    // is worth saying what is there before adding more.
    otherNetworks: [
      ["Google Ad Manager", /securepubads\.g\.doubleclick\.net|googletag\.pubads/i],
      ["Ezoic", /ezoic\.net|ezojs\.com/i],
      ["Mediavine", /scripts\.mediavine\.com/i],
      ["AdThrive / Raptive", /adthrive\.com|raptive\.com/i],
      ["Amazon Publisher Services", /aps\.amazon-adsystem\.com/i],
      ["Taboola", /taboola\.com\/libtrc/i],
      ["Outbrain", /outbrain\.com\/outbrain\.js/i],
    ]
      .filter(([, re]) => re.test(html))
      .map(([n]) => n),
  };
}

// Paths that exist for the app rather than for a reader: nobody arrives from
// search to read a login form, and an ad network counts none of it as
// inventory.
const FUNCTIONAL_SEGMENTS = new Set([
  "login", "signin", "sign-in", "signup", "sign-up", "register", "logout", "account", "accounts",
  "dashboard", "app", "admin", "settings", "profile", "billing", "onboarding", "checkout", "cart",
  "search", "verify", "reset-password", "forgot-password", "thanks", "thank-you", "404", "500",
]);

// Only the FIRST path segment, because that is how sites organise these —
// /legal/dpa, /policies/privacy. Matching any segment would classify a blog
// post at /blog/privacy-and-you as a legal notice.
const POLICY_PREFIXES = new Set(["legal", "legals", "policies", "policy", "compliance"]);

/**
 * Sorts paths into what a reader came for, what the law requires, and what
 * belongs to the application.
 *
 * This exists because an ad network's question is not "how many pages do you
 * have". getmadbot.com was refused by AdSense for low value content while
 * holding thirteen pages — nine of which were terms, privacy, DPA and
 * sub-processors, eighty-seven percent of the site's text. Counting those as
 * substance is how a readiness check tells somebody they are nearly there and
 * then Google tells them they are nowhere near.
 *
 * `content` is a residual, deliberately: it is everything left after the two
 * categories that can be identified with confidence. Deciding that a pricing
 * page is not editorial is a judgement about purpose that no fetch can make,
 * so this does not try — it only removes what is certain.
 */
export function classifyPaths(paths) {
  const out = { content: [], policy: [], functional: [] };
  const seen = new Set();

  for (const raw of paths || []) {
    let path = String(raw || "");
    try {
      if (/^https?:/i.test(path)) path = new URL(path).pathname;
    } catch {
      continue;
    }
    const normalised = path.replace(/\/+$/, "") || "/";
    if (seen.has(normalised)) continue;
    seen.add(normalised);

    const segments = normalised
      .split("/")
      .map((s) => s.replace(/\.(html?|php|aspx?)$/i, "").toLowerCase())
      .filter(Boolean);

    // The homepage is the one page every site has and every reader lands on.
    if (!segments.length) {
      out.content.push(normalised);
      continue;
    }
    if (POLICY_PREFIXES.has(segments[0])) {
      out.policy.push(normalised);
      continue;
    }
    if (segments.some((s) => FUNCTIONAL_SEGMENTS.has(s))) {
      out.functional.push(normalised);
      continue;
    }
    const last = segments[segments.length - 1];
    const isPolicy = POLICY_PAGES.some(
      (page) => page.slug.test(last) || segments.some((s) => page.exact.includes(s))
    );
    (isPolicy ? out.policy : out.content).push(normalised);
  }

  return out;
}
