import { SITE_URL } from "../lib/company";

/**
 * The sitemap, listing every page worth indexing.
 *
 * Deliberately hand-listed rather than discovered from the filesystem. A
 * generated list would silently include the next page somebody adds, whether
 * or not it should be indexed, and a sitemap that lists pages you did not mean
 * to publish is worse than one that is a few days stale. Adding a page here is
 * one line and one decision.
 *
 * /login and /dashboard are absent on purpose. Neither has search value, and
 * robots.txt disallows the dashboard outright.
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
  const now = new Date();
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
