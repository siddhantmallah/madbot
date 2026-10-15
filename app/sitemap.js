import { SITE_URL } from "../lib/company";
import { LEGAL_UPDATED } from "../lib/legalDates";

/**
 * The sitemap, listing every page worth indexing.
 *
 * Deliberately hand-listed rather than discovered from the filesystem. A
 * generated list would silently include the next page somebody adds, whether
 * or not it should be indexed, and a sitemap that lists pages you did not mean
 * to publish is worse than one that is a few days stale. Adding a page here is
 * one line and one decision.
 *
 * /login and /dashboard are absent on purpose: neither has search value, and
 * both are noindex.
 *
 * <lastmod> is sent only where there is a real date for it: the legal
 * documents, from lib/legalDates.js, the same date each page shows. The
 * marketing pages carry none rather than a made-up one. This used to stamp
 * every URL with the time of the request, which search engines learn to
 * ignore for the whole site.
 */
const PAGES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/legal", priority: 0.3, changeFrequency: "monthly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.4, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/refunds", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/acceptable-use", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/dpa", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/subprocessors", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/security", priority: 0.4, changeFrequency: "monthly" },
];

export default function sitemap() {
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    ...(LEGAL_UPDATED[p.path] ? { lastModified: LEGAL_UPDATED[p.path] } : {}),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
