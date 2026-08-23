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
