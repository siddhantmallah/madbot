import { SITE_URL } from "../lib/company";

/**
 * robots.txt, generated rather than kept as a static file so the sitemap URL
 * can never drift from lib/company.js.
 *
 * MADBOT's own free report flags a missing robots.txt as a finding, and the
 * site did not have one. Failing your own audit is not a good look for a
 * product that sells search visibility.
 *
 * Only the API is disallowed. The private pages (/dashboard, /admin, /login,
 * /invite, /maintenance) are kept out of search by `noindex`, in their
 * metadata and in the proxy's X-Robots-Tag, and a noindex only works on a page
 * a crawler is allowed to fetch. Disallowing them here used to hide the
 * noindex, so a linked URL could still be indexed, without its content, from
 * the link alone. The API has no pages to index and nothing to read.
 *
 * No `host` line: it was Yandex-only and is ignored everywhere else.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
