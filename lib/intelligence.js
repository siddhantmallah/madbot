// Builds MADBOT's internal representation of a site from crawl output. Every
// field is inferred from something observed, and each carries how confident
// that inference is — so the UI can show what's known versus guessed rather
// than presenting inference as fact.

import { hostnameOf } from "./seed";

const PAGE_KINDS = [
  { kind: "pricing", re: /\/(pricing|plans|packages)/i },
  { kind: "about", re: /\/(about|company|team|our-story)/i },
  { kind: "contact", re: /\/(contact|support|help|get-in-touch)/i },
  { kind: "blog", re: /\/(blog|news|articles|insights|resources)/i },
  { kind: "product", re: /\/(product|products|features|solutions)/i },
  { kind: "service", re: /\/(service|services)/i },
  { kind: "docs", re: /\/(docs|documentation|guide|api)/i },
  { kind: "legal", re: /\/(privacy|terms|legal|cookie|refund|policy)/i },
  { kind: "faq", re: /\/(faq|faqs|questions)/i },
  { kind: "careers", re: /\/(careers|jobs|hiring)/i },
];

function classify(path) {
  const hit = PAGE_KINDS.find((k) => k.re.test(path));
  return hit ? hit.kind : path === "/" ? "home" : "other";
}

const CURRENCY = /(?:₹|Rs\.?|INR|\$|USD|£|GBP|€|EUR)\s?([\d,]+(?:\.\d{2})?)/g;

function extractPrices(pages) {
  const found = new Set();
  pages.forEach((p) => {
    if (classify(p.path) !== "pricing" && p.path !== "/") return;
    const text = `${p.title || ""} ${p.description || ""} ${p.h1 || ""}`;
    for (const m of text.matchAll(CURRENCY)) found.add(m[0].trim());
  });
  return [...found].slice(0, 8);
}

// Company name: prefer schema-implied branding, then the tail of the homepage
// title (sites overwhelmingly put the brand last), then the domain.
function inferCompanyName(pages, domain) {
  const home = pages.find((p) => p.path === "/") || pages[0];
  if (home?.title) {
    const parts = home.title.split(/[|–—·]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      // Ignore a trailing segment that's just the domain again.
      if (!/\./.test(last) && last.length <= 40) {
        return { value: last, confidence: 0.75, source: "homepage title" };
      }
      const firstPart = parts[0];
      if (firstPart.length <= 40) return { value: firstPart, confidence: 0.6, source: "homepage title" };
    }
    if (home.title.length <= 40) return { value: home.title, confidence: 0.5, source: "homepage title" };
  }
  const base = domain.split(".")[0];
  return { value: base.charAt(0).toUpperCase() + base.slice(1), confidence: 0.3, source: "domain" };
}

function inferGeography(pages) {
  const text = pages
    .map((p) => `${p.title || ""} ${p.description || ""} ${p.h1 || ""}`)
    .join(" ");
  const cities = [
    "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad",
    "London", "Manchester", "New York", "San Francisco", "Austin", "Berlin", "Toronto", "Sydney",
    "Singapore", "Dubai", "Amsterdam", "Rotterdam", "Leeds", "Bristol",
  ];
  const hits = cities.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  const langs = [...new Set(pages.map((p) => p.lang).filter(Boolean))];
  return { locations: hits.slice(0, 5), languages: langs.slice(0, 3) };
}

function inferCategory(pages, schemaTypes) {
  // Schema is the strongest available signal for what kind of business this is.
  const bySchema = [
    { re: /LocalBusiness|Store|Restaurant|HomeAndConstructionBusiness/i, value: "Local business", confidence: 0.8 },
    { re: /SoftwareApplication|WebApplication|SaaS/i, value: "Software / SaaS", confidence: 0.8 },
    { re: /Product|Offer|OfferCatalog/i, value: "Products / e-commerce", confidence: 0.6 },
    { re: /Service/i, value: "Services", confidence: 0.6 },
    { re: /Organization|Corporation/i, value: "Organisation", confidence: 0.35 },
  ];
  const joined = (schemaTypes || []).join(" ");
  const hit = bySchema.find((b) => b.re.test(joined));
  if (hit) return { value: hit.value, confidence: hit.confidence, source: "structured data" };

  const paths = pages.map((p) => classify(p.path));
  if (paths.includes("product")) return { value: "Products", confidence: 0.4, source: "page structure" };
  if (paths.includes("service")) return { value: "Services", confidence: 0.4, source: "page structure" };
  return { value: "Unknown", confidence: 0.1, source: "no clear signal" };
}

function coverageScore(parts) {
  const weights = Object.values(parts);
  if (!weights.length) return 0;
  return Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 100);
}

export function buildIntelligence({ url, crawl }) {
  const domain = hostnameOf(url);
  const pages = crawl?.pages || [];
  const stats = crawl?.stats || null;

  const byKind = {};
  pages.forEach((p) => {
    const k = classify(p.path);
    byKind[k] = (byKind[k] || 0) + 1;
  });

  const company = inferCompanyName(pages, domain);
  const category = inferCategory(pages, stats?.schemaTypes);
  const geo = inferGeography(pages);
  const prices = extractPrices(pages);

  const home = pages.find((p) => p.path === "/") || pages[0] || null;

  // How much MADBOT actually knows, per area — drives the "what I know" view
  // and tells the user which gaps are worth filling in by hand.
  const knowledge = {
    business: coverageScore({
      name: company.confidence,
      category: category.confidence,
      description: home?.description ? 1 : 0,
    }),
    structure: coverageScore({
      pages: Math.min(1, pages.length / 12),
      sitemap: crawl?.sitemapUrls ? 1 : 0,
      hasKeyPages: ["pricing", "about", "contact"].filter((k) => byKind[k]).length / 3,
    }),
    content: coverageScore({
      volume: Math.min(1, (stats?.totalWords || 0) / 6000),
      blog: byKind.blog ? 1 : 0,
      depth: Math.min(1, (stats?.avgWords || 0) / 700),
    }),
    machineReadable: coverageScore({
      schema: Math.min(1, (stats?.pagesWithSchema || 0) / Math.max(1, pages.length)),
      canonical: pages.length ? (pages.length - (stats?.noCanonical || 0)) / pages.length : 0,
    }),
    commercial: coverageScore({
      pricing: byKind.pricing ? 1 : 0,
      prices: prices.length ? 1 : 0,
      contact: byKind.contact ? 1 : 0,
    }),
    audience: 0, // Nothing in a crawl reveals who buys — needs the owner or analytics.
  };

  const gaps = [];
  if (!byKind.pricing) gaps.push({ field: "pricing", ask: "Is pricing public? I couldn't find a pricing page." });
  if (!byKind.about) gaps.push({ field: "about", ask: "No about page found — who is behind this?" });
  if (!byKind.blog) gaps.push({ field: "blog", ask: "No blog or resources section — is publishing something you want?" });
  if (knowledge.audience === 0) gaps.push({ field: "audience", ask: "Who is your ideal customer? Nothing on the site says it outright." });
  if (category.confidence < 0.5) gaps.push({ field: "category", ask: `Is "${category.value}" right for what you do?` });

  return {
    domain,
    url,
    business: {
      name: company.value,
      nameConfidence: company.confidence,
      nameSource: company.source,
      category: category.value,
      categoryConfidence: category.confidence,
      categorySource: category.source,
      description: home?.description || null,
    },
    structure: {
      pagesCrawled: pages.length,
      discovered: stats?.discovered || pages.length,
      byKind,
      topPages: pages
        .slice()
        .sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))
        .slice(0, 8)
        .map((p) => ({ path: p.path, title: p.title, words: p.wordCount })),
      orphanPages: stats?.orphanPages || [],
      sitemapUrls: crawl?.sitemapUrls || 0,
    },
    commercial: { prices, hasPricingPage: !!byKind.pricing },
    geography: geo,
    machine: { schemaTypes: stats?.schemaTypes || [], pagesWithSchema: stats?.pagesWithSchema || 0 },
    health: {
      missingTitle: stats?.missingTitle || 0,
      missingDescription: stats?.missingDescription || 0,
      missingH1: stats?.missingH1 || 0,
      noCanonical: stats?.noCanonical || 0,
      imagesMissingAlt: stats?.imagesMissingAlt || 0,
      totalImages: stats?.totalImages || 0,
      avgResponseMs: stats?.avgResponseMs || null,
      brokenLinks: stats?.brokenLinks || 0,
    },
    knowledge,
    gaps,
    builtAt: new Date().toISOString(),
  };
}
