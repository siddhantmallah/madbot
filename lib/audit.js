import { normalizeUrl, assertPublicHost, safeFetch } from "./urlGuard";

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function first(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
}

function countMatches(html, re) {
  const m = html.match(re);
  return m ? m.length : 0;
}

function metaContent(html, name) {
  return (
    first(html, new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    first(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i"))
  );
}

function propContent(html, prop) {
  return (
    first(html, new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    first(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"))
  );
}

function visibleWordCount(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length : 0;
}

function schemaTypes(html) {
  const types = new Set();
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  blocks.forEach((b) => {
    const inner = b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    // Pull @type values without trusting the JSON to be well-formed.
    const found = inner.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    found.forEach((f) => {
      const t = f.match(/"@type"\s*:\s*"([^"]+)"/);
      if (t) types.add(t[1]);
    });
  });
  return [...types];
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function linkStats(html, baseUrl) {
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
  const internalPaths = new Set();
  hrefs.forEach((h) => {
    if (/^(mailto:|tel:|javascript:)/i.test(h)) return;
    // A bare "#target" is same-page navigation, not a link to another page.
    if (h.startsWith("#")) {
      anchors += 1;
      return;
    }
    const abs = absolutize(h, baseUrl);
    if (!abs) return;
    try {
      const u = new URL(abs);
      const hn = u.hostname.replace(/^www\./, "");
      if (hn === host) {
        internal += 1;
        internalPaths.add(u.pathname.replace(/\/$/, "") || "/");
      } else {
        external += 1;
      }
    } catch {
      /* ignore */
    }
  });
  // Distinct destinations matter more than raw link count for crawl coverage.
  const distinctPages = [...internalPaths].filter((p) => p !== "/").length;
  return { internal, external, anchors, distinctPages, total: internal + external };
}

// Each finding carries what MADBOT would actually do about it — that's the
// difference between a report and a plan.
function buildFindings(d) {
  const f = [];
  const add = (severity, area, title, detail, fix, weight = 0) =>
    f.push({ severity, area, title, detail, fix, weight });

  // — Foundations —
  if (!d.title) {
    add("critical", "Foundations", "No title tag", "Search engines have nothing to show as your headline in results.", "Write a title built around what you actually sell, in the length Google renders without truncating.", 12);
  } else if (d.title.length > 65) {
    add("warning", "Foundations", `Title is ${d.title.length} characters`, "Google truncates around 60, so the end of yours gets cut off in results.", "Rewrite it front-loaded, so the part that matters survives truncation.", 4);
  } else if (d.title.length < 20) {
    add("warning", "Foundations", `Title is only ${d.title.length} characters`, "You're leaving room on the table where buying-intent words could sit.", "Extend it with the terms buyers actually search for.", 4);
  } else {
    add("good", "Foundations", "Title tag looks healthy", `${d.title.length} characters — inside the range Google renders in full.`, null, 0);
  }

  if (!d.description) {
    add("critical", "Foundations", "No meta description", "Google is auto-generating your search snippet from whatever text it finds. You aren't writing your own pitch.", "Write a description per page that reads like an ad for the click, not a summary.", 10);
  } else if (d.description.length > 170) {
    add("warning", "Foundations", `Meta description is ${d.description.length} characters`, "It'll be cut off mid-sentence in results.", "Trim to land the point inside ~155 characters.", 3);
  } else if (d.description.length < 70) {
    add("warning", "Foundations", `Meta description is only ${d.description.length} characters`, "Short snippets waste space you could use to win the click.", "Expand it to use the full snippet width.", 3);
  } else {
    add("good", "Foundations", "Meta description present", `${d.description.length} characters — a sensible length.`, null, 0);
  }

  if (d.h1Count === 0) {
    add("critical", "Foundations", "No H1 heading", "The single strongest on-page signal about what this page is about is missing.", "Add one clear H1 per page that names the thing, matching search intent.", 10);
  } else if (d.h1Count > 1) {
    add("warning", "Foundations", `${d.h1Count} H1 headings`, "Multiple H1s split the signal about what the page is primarily about.", "Collapse to one H1 and demote the rest to H2s.", 4);
  } else {
    add("good", "Foundations", "Exactly one H1", "Clear primary heading — that's what you want.", null, 0);
  }

  if (!d.https) {
    add("critical", "Crawlability", "Not served over HTTPS", "Browsers flag the site as not secure and it's a direct ranking negative.", "Move to HTTPS and redirect every HTTP URL to it.", 15);
  }

  if (!d.viewport) {
    add("critical", "Foundations", "No mobile viewport tag", "Phones render the desktop layout scaled down. Most of your traffic is mobile.", "Add the viewport meta tag and check the layout actually reflows.", 10);
  } else {
    add("good", "Foundations", "Mobile viewport set", "The page declares how to render on phones.", null, 0);
  }

  if (!d.lang) {
    add("warning", "Foundations", "No lang attribute on <html>", "Search engines and screen readers have to guess your language.", "Declare the page language explicitly.", 2);
  }

  if (!d.canonical) {
    add("warning", "Crawlability", "No canonical tag", "If the same page is reachable at more than one URL, ranking signals get split between them.", "Set a self-referencing canonical on every page.", 5);
  } else {
    add("good", "Crawlability", "Canonical tag present", "Duplicate URLs won't split your ranking signals.", null, 0);
  }

  // — AI & structured data: the differentiating angle, and genuinely checkable —
  if (d.schemaTypes.length === 0) {
    add("critical", "AI & structured data", "No structured data at all", "Answer engines and rich results rely on schema markup to understand a page. Yours has none, so you're invisible to the surfaces that are quietly taking over product research.", "Mark up what you are — Organization, Product, FAQ, LocalBusiness as applicable — so machines can parse and cite you.", 14);
  } else {
    add("good", "AI & structured data", `Structured data found: ${d.schemaTypes.slice(0, 4).join(", ")}`, "Machines can parse at least part of this page.", null, 0);
    if (!d.schemaTypes.some((t) => /FAQ|QAPage|HowTo/i.test(t))) {
      add("warning", "AI & structured data", "No FAQ or Q&A markup", "Question-shaped markup is the format answer engines quote most readily.", "Add FAQ schema to the pages that answer real buyer questions.", 5);
    }
  }

  // — Sharing —
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

  // — Content —
  if (d.wordCount < 150) {
    add("critical", "Content", `Only ~${d.wordCount} words of text on the homepage`, "There's very little for a search engine to understand you by, and nothing for an answer engine to quote.", "Add substantive copy that answers what you do, for whom, and why you're different.", 10);
  } else if (d.wordCount < 400) {
    add("warning", "Content", `~${d.wordCount} words on the homepage`, "Thin for a page expected to rank on competitive terms.", "Deepen the page around the questions buyers ask before they contact you.", 5);
  } else {
    add("good", "Content", `~${d.wordCount} words of copy`, "Enough substance for search engines to work with.", null, 0);
  }

  if (d.images > 0 && d.imagesMissingAlt > 0) {
    const pct = Math.round((d.imagesMissingAlt / d.images) * 100);
    add(
      pct > 50 ? "critical" : "warning",
      "Content",
      `${d.imagesMissingAlt} of ${d.images} images have no alt text`,
      "Alt text is how image search and screen readers understand your images. It's also free keyword context you're not using.",
      "Write descriptive alt text on every meaningful image.",
      pct > 50 ? 8 : 4
    );
  } else if (d.images > 0) {
    add("good", "Content", "All images have alt text", `${d.images} images, all described.`, null, 0);
  }

  if (d.links.distinctPages === 0 && d.links.anchors > 2) {
    add(
      "critical",
      "Crawlability",
      "Everything lives on one page",
      `The navigation is ${d.links.anchors} same-page jumps and links out to ${d.links.distinctPages} other page${d.links.distinctPages === 1 ? "" : "s"}. A single page can only realistically rank for one topic — every other thing you sell has nowhere to rank from.`,
      "Split the strongest sections into their own pages, each targeting how buyers actually search for that specific thing, and link them from the homepage.",
      12
    );
  } else if (d.links.distinctPages < 4) {
    add("warning", "Crawlability", `Only ${d.links.distinctPages} other page${d.links.distinctPages === 1 ? "" : "s"} linked from here`, "Crawlers find and rank pages by following links. A thin internal structure leaves pages stranded and caps how many terms you can rank for.", "Build out and interlink the pages worth ranking, so each has its own path in.", 6);
  } else {
    add("good", "Crawlability", `${d.links.distinctPages} internal pages linked`, "Crawlers have paths into the rest of the site.", null, 0);
  }

  // — Crawlability (separate fetches) —
  if (d.robots.exists === false) {
    add("warning", "Crawlability", "No robots.txt", "You're not telling crawlers anything, including where your sitemap is.", "Add a robots.txt that points at your sitemap.", 3);
  } else if (d.robots.blocksAll) {
    add("critical", "Crawlability", "robots.txt blocks all crawlers", "Your own robots.txt is telling search engines to stay out. Nothing else matters until this is fixed.", "Remove the blanket disallow so the site can be indexed.", 20);
  } else if (d.robots.exists) {
    add("good", "Crawlability", "robots.txt present", d.robots.hasSitemap ? "And it points at your sitemap." : "Though it doesn't reference a sitemap.", null, 0);
  }

  if (d.sitemap.exists === false) {
    add("warning", "Crawlability", "No sitemap.xml found", "Search engines are left to discover your pages by crawling alone, which is slower and less complete.", "Generate a sitemap and submit it, so new pages get found quickly.", 6);
  } else if (d.sitemap.exists) {
    add("good", "Crawlability", `Sitemap found${d.sitemap.urlCount ? ` (~${d.sitemap.urlCount} URLs)` : ""}`, "Search engines have a map of your pages.", null, 0);
  }

  // — Performance proxies (measured, not modelled) —
  if (d.elapsedMs > 2500) {
    add("critical", "Performance", `Homepage took ${(d.elapsedMs / 1000).toFixed(1)}s to respond`, "Slow first response costs you both rankings and visitors who leave before it paints.", "Find what's blocking the initial response — hosting, redirects or server-side work.", 10);
  } else if (d.elapsedMs > 1200) {
    add("warning", "Performance", `Homepage responded in ${(d.elapsedMs / 1000).toFixed(1)}s`, "Slower than it should be. Speed is a ranking input and a conversion one.", "Trim the time to first byte — caching or a CDN usually does it.", 5);
  } else {
    add("good", "Performance", `Responded in ${(d.elapsedMs / 1000).toFixed(2)}s`, "Quick first response.", null, 0);
  }

  if (d.scripts > 25) {
    add("warning", "Performance", `${d.scripts} script tags on one page`, "Each one is work the browser has to do before the page is usable.", "Audit what's actually needed and defer or drop the rest.", 4);
  }

  if (!d.faviconUrl) {
    add("warning", "Foundations", "No favicon declared", "Your tab, bookmarks and search results show a blank placeholder.", "Add a favicon — small thing, but it reads as unfinished without one.", 2);
  }

  return f;
}

export async function runAudit(input) {
  const target = normalizeUrl(input);
  await assertPublicHost(target.hostname);

  const main = await safeFetch(target.toString(), { timeoutMs: 9000 });
  if (!main.ok) {
    const err = new Error(`status ${main.status}`);
    err.code = "bad_status";
    err.status = main.status;
    throw err;
  }

  const html = main.body;
  const base = main.finalUrl;

  const origin = new URL(base).origin;
  const [robotsRes, sitemapRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { timeoutMs: 4500, capBytes: 40_000 }).catch(() => null),
    safeFetch(`${origin}/sitemap.xml`, { timeoutMs: 4500, capBytes: 120_000 }).catch(() => null),
  ]);

  const robotsBody = robotsRes?.ok ? robotsRes.body : "";
  const robots = {
    exists: !!robotsRes?.ok,
    hasSitemap: /sitemap\s*:/i.test(robotsBody),
    blocksAll: /user-agent\s*:\s*\*[\s\S]*?disallow\s*:\s*\/\s*(\n|$)/i.test(robotsBody),
  };

  const sitemapBody = sitemapRes?.ok ? sitemapRes.body : "";
  const looksLikeSitemap = /<(urlset|sitemapindex)/i.test(sitemapBody);
  const sitemap = {
    exists: !!sitemapRes?.ok && looksLikeSitemap,
    urlCount: looksLikeSitemap ? countMatches(sitemapBody, /<loc>/gi) : 0,
  };

  const iconHref =
    first(html, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
    first(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i) ||
    first(html, /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i);

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imagesMissingAlt = imgTags.filter((t) => !/\balt\s*=\s*["'][^"']*[^"'\s][^"']*["']/i.test(t)).length;

  const data = {
    url: target.toString(),
    finalUrl: base,
    https: new URL(base).protocol === "https:",
    title: first(html, /<title[^>]*>([^<]*)<\/title>/i),
    description: metaContent(html, "description"),
    lang: first(html, /<html[^>]+lang=["']([^"']+)["']/i),
    viewport: !!metaContent(html, "viewport"),
    canonical: first(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i),
    ogTitle: propContent(html, "og:title"),
    ogDescription: propContent(html, "og:description"),
    ogImage: propContent(html, "og:image"),
    faviconUrl: iconHref ? absolutize(iconHref, base) : null,
    h1Count: countMatches(html, /<h1\b/gi),
    h2Count: countMatches(html, /<h2\b/gi),
    h3Count: countMatches(html, /<h3\b/gi),
    images: imgTags.length,
    imagesMissingAlt,
    scripts: countMatches(html, /<script\b/gi),
    stylesheets: countMatches(html, /<link[^>]+rel=["']stylesheet["']/gi),
    wordCount: visibleWordCount(html),
    schemaTypes: schemaTypes(html),
    links: linkStats(html, base),
    htmlKb: Math.round(main.bytes / 1024),
    elapsedMs: main.elapsedMs,
    robots,
    sitemap,
  };

  const findings = buildFindings(data);
  const penalty = findings.reduce((sum, x) => sum + (x.weight || 0), 0);
  const score = Math.max(5, Math.min(100, 100 - penalty));

  const criticals = findings.filter((x) => x.severity === "critical");
  const warnings = findings.filter((x) => x.severity === "warning");
  const good = findings.filter((x) => x.severity === "good");

  return {
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
      internalLinks: data.links.internal,
      externalLinks: data.links.external,
      anchorLinks: data.links.anchors,
      distinctPages: data.links.distinctPages,
      h1: data.h1Count,
      h2: data.h2Count,
      scripts: data.scripts,
      stylesheets: data.stylesheets,
      htmlKb: data.htmlKb,
      responseMs: data.elapsedMs,
      schemaTypes: data.schemaTypes,
      sitemapUrls: data.sitemap.urlCount,
    },
  };
}
