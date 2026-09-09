// Shared HTML extraction. Both the single-page audit and the multi-page
// crawler parse the same way, so a finding means the same thing wherever it
// was produced.

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

export function metaContent(html, name) {
  return (
    first(html, new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    first(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i"))
  );
}

export function propContent(html, prop) {
  return (
    first(html, new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    first(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"))
  );
}

export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visibleWordCount(html) {
  const t = visibleText(html);
  return t ? t.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length : 0;
}

export function schemaTypes(html) {
  const types = new Set();
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  blocks.forEach((b) => {
    const inner = b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
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
  const hrefs = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]);
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

export function extractIcon(html, base) {
  const href =
    first(html, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
    first(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i) ||
    first(html, /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i);
  return href ? absolutize(href, base) : absolutize("/favicon.ico", base);
}

// One page's observable surface — the unit the crawler stores per URL.
export function parsePage(html, finalUrl, meta = {}) {
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
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
    title: first(html, /<title[^>]*>([^<]*)<\/title>/i) || null,
    description: metaContent(html, "description") || null,
    h1: first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim() || null,
    h1Count: countMatches(html, /<h1\b/gi),
    h2Count: countMatches(html, /<h2\b/gi),
    h3Count: countMatches(html, /<h3\b/gi),
    canonical: first(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || null,
    robotsMeta: metaContent(html, "robots") || null,
    ogTitle: propContent(html, "og:title") || null,
    ogImage: propContent(html, "og:image") || null,
    viewport: !!metaContent(html, "viewport"),
    lang: first(html, /<html[^>]+lang=["']([^"']+)["']/i) || null,
    wordCount: visibleWordCount(html),
    schemaTypes: schemaTypes(html),
    images: imgTags.length,
    imagesMissingAlt: imgTags.filter((t) => !/\balt\s*=\s*["'][^"']*[^"'\s][^"']*["']/i.test(t)).length,
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
  const meta =
    first(html, /<meta[^>]+charset=["']?([a-z0-9_-]+)/i) ||
    first(html, /<meta[^>]+http-equiv=["']content-type["'][^>]+charset=([a-z0-9_-]+)/i);
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
  [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].forEach((m) => {
    const abs = absolutize(m[1], baseUrl);
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
  (html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach((e) => {
    // Filenames and CSS urls can look like an address; a real one does not end
    // in an asset extension.
    if (/\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i.test(e)) return;
    out.add(e.toLowerCase());
  });
  return [...out].slice(0, 12);
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
  [
    /<script[^>]+src=["'](http:\/\/[^"']+)["']/gi,
    /<link[^>]+href=["'](http:\/\/[^"']+)["'][^>]*rel=["']stylesheet["']/gi,
    /<link[^>]+rel=["']stylesheet["'][^>]*href=["'](http:\/\/[^"']+)["']/gi,
    /<img[^>]+src=["'](http:\/\/[^"']+)["']/gi,
    /<iframe[^>]+src=["'](http:\/\/[^"']+)["']/gi,
    /<(?:source|video|audio)[^>]+src=["'](http:\/\/[^"']+)["']/gi,
  ].forEach((re) => {
    [...html.matchAll(re)].forEach((m) => out.add(m[1]));
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
  const pattern = /<a\b[^>]*>([\s\S]{0,300}?)<\/a>/gi;
  const labels = new Map();
  [...html.matchAll(pattern)].forEach((m) => {
    const label = visibleText(m[1]).toLowerCase();
    if (label && label.length < 60) labels.set(label, (labels.get(label) || 0) + 1);
  });
  const boilerplate = new Set([...labels].filter(([, n]) => n >= 4).map(([label]) => label));
  if (!boilerplate.size) return html;
  return html.replace(pattern, (full, inner) =>
    boilerplate.has(visibleText(inner).toLowerCase()) ? " " : full
  );
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
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  const missing = tags.filter((t) => !(/\bwidth\s*=/i.test(t) && /\bheight\s*=/i.test(t)));
  return { total: tags.length, missing: missing.length };
}

/** External scripts in <head> with neither async nor defer — they block paint. */
export function blockingHeadScripts(html) {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i);
  if (!head) return 0;
  return (head[0].match(/<script\b[^>]*\bsrc=[^>]*>/gi) || []).filter(
    (t) => !/\basync\b/i.test(t) && !/\bdefer\b/i.test(t) && !/type=["']module["']/i.test(t)
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
  [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)].forEach((m) =>
    consider(m[1], visibleText(m[2]))
  );

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
    slots: countMatches(html, /<ins[^>]+adsbygoogle/gi),
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
