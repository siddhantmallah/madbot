// The site's own SEO, checked as a crawler sees it: robots.txt, the sitemap,
// noindex on every private page, the 404, Open Graph, fonts, the manifest and
// structured data.
//   node --no-warnings --import ./tests/_register.mjs tests/seo.test.mjs
// (needs `next dev` on http://localhost:3000)
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const { LEGAL_UPDATED, updatedOn } = await import("../lib/legalDates.js");
const { SITE_URL } = await import("../lib/company.js");

const BASE = process.env.MADBOT_BASE || "http://localhost:3000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  return { status: res.status, headers: res.headers, text: await res.text() };
}
const meta = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`)) || html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${key}"`));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'") : null;
};
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flat();

suite("robots.txt and the sitemap");

await test("robots.txt blocks only the API, names the sitemap, and has no host line", async () => {
  const r = await get("/robots.txt");
  truthy(/Disallow: \/api\//.test(r.text), "API disallowed");
  for (const p of ["/dashboard", "/admin", "/login", "/invite"]) {
    truthy(!new RegExp(`Disallow: ${p}`).test(r.text), `${p} must be crawlable so its noindex is seen`);
  }
  truthy(!/^Host:/im.test(r.text), "no Host line");
  truthy(r.text.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), "sitemap");
});

let sitemapUrls = [];
await test("the sitemap sends lastmod only where there's a real date, and it matches the page", async () => {
  const r = await get("/sitemap.xml");
  const entries = [...r.text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: m[1].match(/<loc>(.*?)<\/loc>/)[1],
    lastmod: m[1].match(/<lastmod>(.*?)<\/lastmod>/)?.[1] || null,
  }));
  sitemapUrls = entries.map((e) => e.loc);
  eq(entries.length, 13, "13 public pages");
  for (const e of entries) {
    const path = e.loc.slice(SITE_URL.length) || "/";
    truthy(e.loc.startsWith(SITE_URL), `${e.loc} on the canonical host`);
    if (LEGAL_UPDATED[path]) eq((e.lastmod || "").slice(0, 10), LEGAL_UPDATED[path], `${path} lastmod`);
    else eq(e.lastmod, null, `${path} carries no invented lastmod`);
  }
});

suite("private pages are noindex and crawlable");

await test("dashboard, login, console, invitation and maintenance pages say noindex", async () => {
  for (const path of ["/dashboard", "/login", "/admin/login", "/invite", "/maintenance", "/auth/action"]) {
    const r = await get(path);
    eq(r.status, 200, path);
    truthy(/noindex/.test(meta(r.text, "name", "robots") || ""), `${path} robots meta: ${meta(r.text, "name", "robots")}`);
    truthy(/noindex/.test(r.headers.get("x-robots-tag") || ""), `${path} X-Robots-Tag`);
  }
});

await test("the dashboard has its own title and no canonical claiming to be the homepage", async () => {
  const r = await get("/dashboard");
  truthy(/<title>Dashboard · MADBOT<\/title>/.test(r.text), "title");
  truthy(!/<link rel="canonical"/.test(r.text), "no canonical");
});

suite("the 404");

await test("an unknown address is a real 404 with a way back, noindex and no canonical", async () => {
  const r = await get("/this-page-does-not-exist-" + Date.now());
  eq(r.status, 404, "status");
  truthy(r.text.includes("Nothing lives at this address."), "our page, not the default");
  for (const href of ["/pricing", "/contact", "/legal"]) truthy(r.text.includes(`href="${href}"`), `links to ${href}`);
  truthy(/noindex/.test(meta(r.text, "name", "robots") || ""), "noindex");
  truthy(!/<link rel="canonical"/.test(r.text), "no canonical");
  eq((r.text.match(/<title>/g) || []).length, 1, "one title");
});

suite("the homepage head");

await test("og:url is the canonical www address, not the apex", async () => {
  const r = await get("/");
  const og = meta(r.text, "property", "og:url");
  truthy(og && og.replace(/\/$/, "") === SITE_URL, `og:url ${og}`);
});

await test("fonts are self-hosted: nothing from Google in the page or the policy", async () => {
  const r = await get("/");
  truthy(!/fonts\.(googleapis|gstatic)\.com/.test(r.text), "no Google Fonts in the HTML");
  truthy(!/fonts\.(googleapis|gstatic)\.com/.test(r.headers.get("content-security-policy") || ""), "nor in the CSP");
  truthy(/\/_next\/static\/media\/[^"]+\.woff2/.test(r.text), "a self-hosted font is preloaded");
});

await test("theme-color follows the colour scheme", async () => {
  const r = await get("/");
  const tags = [...r.text.matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0]);
  eq(tags.length, 2, "dark and light");
  truthy(tags.some((t) => t.includes("#0A0810")), "dark ground");
});

suite("the manifest");

await test("the manifest exists and every icon it names is served", async () => {
  const r = await get("/manifest.webmanifest");
  eq(r.status, 200, "status");
  const m = JSON.parse(r.text);
  eq(m.start_url, "/", "start_url");
  truthy(m.icons.length >= 2, "icons");
  for (const icon of m.icons) eq((await get(icon.src)).status, 200, icon.src);
  truthy(r.text && (await get("/")).text.includes('rel="manifest"'), "linked from the page");
});

suite("every public page");

await test("descriptions fit in a search result (155 characters or fewer)", async () => {
  for (const loc of sitemapUrls) {
    const path = loc.slice(SITE_URL.length) || "/";
    const d = meta((await get(path)).text, "name", "description");
    truthy(d, `${path} has a description`);
    truthy(d.length <= 155, `${path}: ${d.length} characters`);
  }
  return `${sitemapUrls.length} pages`;
});

await test("each legal page has a three-step breadcrumb and shows the date the sitemap sends", async () => {
  for (const path of Object.keys(LEGAL_UPDATED).filter((p) => p !== "/legal")) {
    const r = await get(path);
    const crumb = ldBlocks(r.text).find((b) => b["@type"] === "BreadcrumbList");
    truthy(crumb, `${path} breadcrumb`);
    eq(crumb.itemListElement.length, 3, `${path} steps`);
    eq(crumb.itemListElement[2].item, `${SITE_URL}${path}`, `${path} last crumb`);
    truthy(r.text.includes(`Last updated <!-- -->${updatedOn(path)}`) || r.text.includes(`Last updated ${updatedOn(path)}`), `${path} shows ${updatedOn(path)}`);
  }
});

report();
