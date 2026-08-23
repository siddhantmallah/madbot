import { normalizeUrl, assertPublicHost, safeFetch } from "./urlGuard";
import { canonicalizeUrl, extractIcon, metaContent, parsePage, propContent, first } from "./htmlParse";

const SEED_PATHS = ["/", "/about", "/pricing", "/products", "/services", "/blog", "/contact", "/faq"];

// Minimal robots.txt: collects Disallow rules for * and our own agent. Not a
// full spec implementation, but enough to honour an explicit exclusion.
function parseRobots(body) {
  const rules = { disallow: [], sitemaps: [], blocksAll: false };
  if (!body) return rules;
  let applies = false;
  body.split(/\r?\n/).forEach((raw) => {
    const line = raw.split("#")[0].trim();
    if (!line) return;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || /madbot/i.test(value);
    } else if (key === "disallow" && applies) {
      if (value === "/") rules.blocksAll = true;
      else if (value) rules.disallow.push(value);
    } else if (key === "sitemap") {
      rules.sitemaps.push(value);
    }
  });
  return rules;
}

function isDisallowed(pathname, rules) {
  return rules.disallow.some((p) => pathname.startsWith(p));
}

function looksLikeAsset(url) {
  return /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|eot)(\?|$)/i.test(url);
}

async function fetchSitemapUrls(origin, sitemapHints) {
  const candidates = [...new Set([...(sitemapHints || []), `${origin}/sitemap.xml`])];
  const found = new Set();
  for (const sm of candidates.slice(0, 3)) {
    const res = await safeFetch(sm, { timeoutMs: 5000, capBytes: 200_000 }).catch(() => null);
    if (!res?.ok || !/<(urlset|sitemapindex)/i.test(res.body)) continue;
    // A sitemap index points at more sitemaps; follow one level only.
    if (/<sitemapindex/i.test(res.body)) {
      const children = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 2);
      for (const child of children) {
        const cres = await safeFetch(child, { timeoutMs: 5000, capBytes: 200_000 }).catch(() => null);
        if (cres?.ok) {
          [...cres.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].forEach((m) => found.add(m[1]));
        }
      }
    } else {
      [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].forEach((m) => found.add(m[1]));
    }
  }
  return [...found];
}

/**
 * Breadth-first same-origin crawl. Bounded by maxPages/maxDepth and a wall
 * clock, because this runs inside a request-scoped serverless function.
 * onProgress lets a job record its step output as it goes.
 */
export async function crawlSite(input, { maxPages = 20, maxDepth = 2, budgetMs = 120_000, onProgress } = {}) {
  const start = normalizeUrl(input);
  await assertPublicHost(start.hostname);
  const origin = start.origin;
  const startedAt = Date.now();

  const robotsRes = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 5000, capBytes: 40_000 }).catch(() => null);
  const robots = parseRobots(robotsRes?.ok ? robotsRes.body : "");

  if (robots.blocksAll) {
    return {
      origin,
      blockedByRobots: true,
      pages: [],
      robots: { exists: !!robotsRes?.ok, blocksAll: true, sitemaps: robots.sitemaps },
      sitemapUrls: 0,
      stats: null,
    };
  }

  const sitemapUrls = await fetchSitemapUrls(origin, robots.sitemaps);

  const seen = new Set();
  const queue = [];
  // Origin matters: a guessed path that 404s means "this site has no /pricing",
  // which is not the same thing as a broken link the site actually publishes.
  const push = (url, depth, source) => {
    const c = canonicalizeUrl(url, origin);
    if (!c || seen.has(c)) return;
    try {
      const u = new URL(c);
      if (u.origin !== origin) return;
      if (looksLikeAsset(c)) return;
      if (isDisallowed(u.pathname, robots)) return;
    } catch {
      return;
    }
    seen.add(c);
    queue.push({ url: c, depth, source });
  };

  push(start.toString(), 0, "start");
  SEED_PATHS.forEach((p) => push(`${origin}${p}`, 1, "guess"));
  sitemapUrls.slice(0, maxPages * 2).forEach((u) => push(u, 1, "sitemap"));

  const pages = [];
  let homepageIcon = null;
  let homepageDescription = null;
  let homepageOgTitle = null;
  const errors = [];

  while (queue.length && pages.length < maxPages) {
    if (Date.now() - startedAt > budgetMs) break;

    // Small parallel batch — polite, and keeps the wall clock sane.
    const batch = [];
    while (batch.length < 3 && queue.length && pages.length + batch.length < maxPages) {
      const next = queue.shift();
      if (next.depth <= maxDepth) batch.push(next);
    }
    if (!batch.length) break;

    const results = await Promise.all(
      batch.map(async ({ url, depth, source }) => {
        const res = await safeFetch(url, { timeoutMs: 8000 }).catch((e) => ({ error: e }));
        return { url, depth, source, res };
      })
    );

    results.forEach(({ url, depth, source, res }) => {
      if (!res || res.error || !res.ok) {
        errors.push({ url, status: res?.status ?? null, source });
        return;
      }
      if (!/text\/html|^\s*<!doctype|<html/i.test(res.body.slice(0, 400)) && !res.body.includes("<html")) {
        return;
      }
      const page = parsePage(res.body, res.finalUrl || url, {
        status: res.status,
        bytes: res.bytes,
        elapsedMs: res.elapsedMs,
      });
      page.depth = depth;
      pages.push(page);

      if (depth === 0) {
        homepageIcon = extractIcon(res.body, res.finalUrl || url);
        homepageDescription = metaContent(res.body, "description") || null;
        homepageOgTitle = propContent(res.body, "og:title") || null;
      }

      page.outLinks.forEach((l) => push(l, depth + 1, "link"));
      delete page.outLinks;
    });

    if (onProgress) onProgress({ crawled: pages.length, queued: queue.length });
  }

  const totalWords = pages.reduce((s, p) => s + (p.wordCount || 0), 0);
  const withSchema = pages.filter((p) => (p.schemaTypes || []).length > 0).length;
  const allSchema = [...new Set(pages.flatMap((p) => p.schemaTypes || []))];
  const missingTitle = pages.filter((p) => !p.title).length;
  const missingDesc = pages.filter((p) => !p.description).length;
  const missingH1 = pages.filter((p) => !p.h1Count).length;
  const noCanonical = pages.filter((p) => !p.canonical).length;
  const imagesMissingAlt = pages.reduce((s, p) => s + (p.imagesMissingAlt || 0), 0);
  const totalImages = pages.reduce((s, p) => s + (p.images || 0), 0);
  const avgMs = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.responseMs || 0), 0) / pages.length)
    : null;

  // A page nothing else links to is effectively invisible to crawlers.
  const linkedTo = new Set();
  pages.forEach((p) => (p.outLinks || []).forEach((l) => linkedTo.add(l)));
  const orphans = pages.filter((p) => p.depth > 0 && !linkedTo.has(p.url)).map((p) => p.path);

  // Only a URL the site itself links to can be a broken link. A guessed path
  // or a stale sitemap entry that 404s is a different (and milder) finding.
  const brokenLinks = errors.filter((e) => e.source === "link");
  const staleSitemap = errors.filter((e) => e.source === "sitemap");
  const absentPaths = errors
    .filter((e) => e.source === "guess")
    .map((e) => {
      try {
        return new URL(e.url).pathname;
      } catch {
        return e.url;
      }
    });

  return {
    origin,
    blockedByRobots: false,
    robots: { exists: !!robotsRes?.ok, blocksAll: false, sitemaps: robots.sitemaps, disallowCount: robots.disallow.length },
    sitemapUrls: sitemapUrls.length,
    homepage: { faviconUrl: homepageIcon, description: homepageDescription, ogTitle: homepageOgTitle },
    pages,
    errors: errors.slice(0, 20),
    stats: {
      pagesCrawled: pages.length,
      // Guessed paths that don't exist were never really "discovered".
      discovered: seen.size - absentPaths.length,
      totalWords,
      avgWords: pages.length ? Math.round(totalWords / pages.length) : 0,
      pagesWithSchema: withSchema,
      schemaTypes: allSchema,
      missingTitle,
      missingDescription: missingDesc,
      missingH1,
      noCanonical,
      totalImages,
      imagesMissingAlt,
      avgResponseMs: avgMs,
      orphanPages: orphans,
      brokenLinks: brokenLinks.length,
      brokenLinkUrls: brokenLinks.slice(0, 10).map((e) => e.url),
      staleSitemapEntries: staleSitemap.length,
      absentCommonPaths: absentPaths,
      singlePageSite: pages.length === 1 && brokenLinks.length === 0,
      elapsedMs: Date.now() - startedAt,
    },
  };
}
