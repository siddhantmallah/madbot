import { SITE_URL } from "../lib/company";

/**
 * robots.txt, generated rather than kept as a static file so the host can
 * never drift from lib/company.js.
 *
 * MADBOT's own free report flags a missing robots.txt as a finding, and the
 * site did not have one. Failing your own audit is not a good look for a
 * product that sells search visibility.
 *
 * The dashboard and the API are disallowed. Neither has any search value, both
 * are auth-gated anyway, and a crawler wandering into them just burns budget
 * that should be spent on the pages meant to rank.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
