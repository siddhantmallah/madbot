// Site naming helpers, the planned-piece descriptions, and the one setup
// activity entry.
//
// This file used to hold a deterministic generator of illustrative
// opportunities, with invented forecasts ("+80–160 visits/mo by week 7") and
// hash-seeded confidence percentages. Nothing rendered them any more — the
// opportunity map is built from real measurements in lib/opportunities.js —
// so they were made-up numbers waiting for a code path to leak through. Gone.

export function hostnameOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const DISPLAY_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

// Titles stored before entity-decoding landed (or double-encoded at the
// source) still hold things like "&amp;". Decode at render time so old rows
// display correctly instead of leaking markup into the UI.
export function decodeEntities(str) {
  if (!str) return str;
  let out = String(str);
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-z]+);/gi, (m, n) => DISPLAY_ENTITIES[n.toLowerCase()] ?? m);
  }
  return out;
}

export function siteDisplayName(site) {
  const host = hostnameOf(site.url || "");
  const title = decodeEntities(site.title);
  return title && title !== site.url ? title : host;
}

// A short, generation-and-UI-safe name: real page titles are often long
// ("Free SSL Checker & Domain Monitor | CertNotify"), so take the first
// segment before a separator and cap the length.
export function shortSiteName(site) {
  const raw = siteDisplayName(site);
  const segment = raw.split(/[|–—:·]/)[0].trim() || raw;
  return segment.length > 40 ? segment.slice(0, 37).trimEnd() + "…" : segment;
}

// What the dashboard actually reads off a site for display: its hostname and a
// short name. Everything else it shows is measured.
export function buildSiteInsights(site) {
  return { domain: hostnameOf(site.url || "yoursite.com"), name: shortSiteName(site) };
}

export const CONTENT_BODY = {
  Pillar: (name) => `${name} doesn't need to be complicated. This page covers what buyers actually ask, in plain language, before they ever talk to you.`,
  Support: () => "A shorter supporting piece that answers one specific question well, and links back to the pillar page.",
  Compare: (name) => `An honest, factual comparison — what ${name} does differently, without trashing anyone.`,
  Answer: () => "Short, quotable definitions written the way answer engines prefer to cite them.",
  Outreach: () => "A pitch to an editor or publication that already covers your space.",
  Digest: () => "Your weekly summary — what shipped, what's waiting on you, what changed.",
  Upkeep: () => "Refreshing older pages that have gone stale, so they keep ranking.",
};

// The activity log records only things that actually happened. At setup that
// means one entry: the real fetch of the user's site. Everything after it is
// written when the user themselves does something (queues a play, marks a
// piece published, approves an item). Nothing invents completed work — no
// "fixed your meta descriptions", no "keyword entered the top 10".
export function baseActivitySeed(domain, { read = true } = {}) {
  return [
    read
      ? {
          k: "seo",
          text: `Read ${domain} and set up your workspace`,
          why: "Fetched the homepage for its title and description — no tags installed, no forms filled",
          result: "Done",
        }
      : {
          // A failed read must not be logged as a successful one.
          k: "seo",
          text: `Connected ${domain} — couldn't read it automatically`,
          why: "The homepage didn't respond in time or refused the request. The full crawl will try again.",
          result: "Connected",
        },
  ];
}
