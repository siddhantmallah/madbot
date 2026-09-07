// Per-page metadata, in one place.
//
// Thirteen of the fourteen public pages had none of their own. Every one of
// them inherited the homepage's title and description, so the pricing page,
// the contact page and all nine policy pages presented Google with the same
// title and the same snippet. Duplicate titles across a whole site is the
// first thing any audit flags, including MADBOT's own.
//
// They could not export metadata because they are client components, and a
// client component cannot. A layout can, even when the page it wraps is a
// client component, which is why each route gets a three-line layout.js
// calling this.

import { SITE_URL } from "./company";

const SUFFIX = "MADBOT";

/**
 * One page's metadata.
 *
 * `path` is used for the canonical and the Open Graph URL, so it must match
 * the route exactly. Titles are written to be read in a search result, which
 * means the distinguishing words come first: "Pricing" before the brand, not
 * after a sentence about autonomous marketing.
 */
export function pageMeta({ title, description, path, noindex = false, image = "/og.png" }) {
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  return {
    title: `${title} · ${SUFFIX}`,
    description,
    alternates: { canonical: path },
    // Login and anything behind it has no search value, and indexing a sign-in
    // form just competes with the pages that should rank.
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      siteName: SUFFIX,
      title: `${title} · ${SUFFIX}`,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: `${title} · ${SUFFIX}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SUFFIX}`,
      description,
      images: [image],
    },
  };
}

/**
 * A BreadcrumbList for a nested page.
 *
 * Worth having on the policy pages specifically: it is what lets a search
 * result show "madbot.com › Legal › Privacy Policy" instead of a bare URL,
 * and every crumb here corresponds to a page that genuinely exists.
 */
export function breadcrumbs(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: `${SITE_URL}${step.path === "/" ? "" : step.path}`,
    })),
  };
}
