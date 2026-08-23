// Deterministic generator for the *suggestion* surfaces (the opportunity map,
// the starter content plan, the example prospect list). These are illustrative
// plays with illustrative estimates, not measurements — screens that render
// them say so. Nothing here is presented as observed data: measured metrics
// live behind real integrations and show an empty state until those exist.

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

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

function pctFactory(seedStr) {
  const rand = hashSeed(seedStr);
  return (min, max) => Math.round(min + rand() * (max - min));
}

export function buildSiteInsights(site) {
  const domain = hostnameOf(site.url || "yoursite.com");
  const name = shortSiteName(site);
  const pct = pctFactory(domain);

  const nodeData = [
    { id: "kw", x: 322, y: 176, d: 100, label: "Your highest-value keyword", bg: "var(--color-accent)", fg: "var(--color-bg)", fs: "11.5px" },
    { id: "reddit", x: 88, y: 200, d: 80, label: "Unanswered forum question", bg: "var(--color-accent-2-500)", fg: "var(--color-bg)", fs: "11px" },
    { id: "orgs", x: 392, y: 348, d: 90, label: `${pct(8, 20)} companies who fit your ICP`, bg: "var(--color-accent-400)", fg: "var(--color-accent-900)", fs: "10.5px" },
    { id: "dead", x: 152, y: 392, d: 72, label: "Dead links you could reclaim", bg: "var(--color-accent-2-300)", fg: "var(--color-accent-2-900)", fs: "10px" },
    { id: "vs", x: 306, y: 452, d: 64, label: "vs. a close competitor", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)", fs: "10px" },
    { id: "gloss", x: 246, y: 92, d: 58, label: "A glossary hub", bg: "var(--color-neutral-300)", fg: "var(--color-text)", fs: "9.5px" },
    { id: "pr", x: 512, y: 250, d: 54, label: "A seasonal PR angle", bg: "var(--color-neutral-200)", fg: "var(--color-text)", fs: "9px" },
    { id: "faq", x: 62, y: 320, d: 48, label: "A real FAQ hub", bg: "var(--color-neutral-200)", fg: "var(--color-text)", fs: "9px" },
    { id: "yt", x: 372, y: 74, d: 42, label: "Short setup video", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)", fs: "9px" },
  ];

  const oppData = {
    kw: { title: "Your highest-value keyword", body: `A high-intent search phrase in your space with real volume, and nobody on ${domain} has written a decent page for it yet.`, v: "High", d: "Low", c: `${pct(70, 84)}%`, a: "No", f: `+${pct(80, 160)} visits/mo by week 7`, fm: "Effort low · no approval needed", plan: ["Write the pillar page", "3 supporting articles + FAQ schema", "Internal links from existing pages", "Pitch a few sites that link to rivals"] },
    reddit: { title: "Unanswered forum question", body: "People asking exactly what you solve, with nobody helpful replying. Worth a real answer, not a pitch.", v: "Medium", d: "Low", c: `${pct(58, 70)}%`, a: "Yes — public", f: "+40 visits and goodwill", fm: "Public communication · you send it", plan: ["Draft one honest reply", "You approve the tone", "Post it", "Link only where it helps"] },
    orgs: { title: "Companies who fit your ideal customer profile", body: "Public signals say these teams have a reason to act now. That is the whole pitch.", v: "High", d: "Low", c: `${pct(64, 78)}%`, a: "No", f: `${pct(2, 5)} demos booked`, fm: "Outreach · capped per day · your rules apply", plan: ["Verify each signal", "Write one email per company", "Offer something useful first", "Stop after one follow-up"] },
    dead: { title: "Dead links on relevant sites", body: "A few editors are linking to pages that no longer exist. You have a better page for each.", v: "Medium", d: "Low", c: `${pct(74, 88)}%`, a: "No", f: "+4 referring domains", fm: "Effort low · high confidence", plan: ["Confirm each broken link", "Match your closest page", "One short, useful email", "Track and never chase twice"] },
    vs: { title: `Comparison page vs. a competitor`, body: "A close competitor just changed something public, so shoppers are comparing right now. Fair, factual, no trash talk.", v: "Medium", d: "Medium", c: `${pct(52, 62)}%`, a: "Yes — claims", f: "+70 high-intent visits/mo", fm: "Under 60% confident, so you decide", plan: ["Pull both feature sets honestly", "Write the page", "You check every claim", "Publish and monitor"] },
    gloss: { title: "A glossary hub", body: "Cheap to make, gets cited by answer engines, and feeds internal links to everything else.", v: "Low", d: "Low", c: `${pct(80, 90)}%`, a: "No", f: "+30 visits/mo, slow burn", fm: "Effort low · compounding", plan: ["Short definitions for your space", "Schema-mark every one", "Link to your product pages", "Refresh quarterly"] },
    pr: { title: "A seasonal PR angle", body: "There's a predictable moment each year when your topic gets attention. Being quotable in it is worth a year of blogging.", v: "High", d: "High", c: `${pct(28, 40)}%`, a: "Yes", f: "One tier-1 mention, maybe", fm: "Low confidence, high ceiling", plan: ["Prepare a data angle", "Build a journalist list", "You approve every quote", "Pitch in the window"] },
    faq: { title: "A real FAQ hub", body: "Several of your support answers deserve public pages. Free traffic and fewer tickets.", v: "Medium", d: "Low", c: `${pct(70, 82)}%`, a: "No", f: "+55 visits/mo, fewer tickets", fm: "Effort low", plan: ["Mine your support inbox", "Write the pages", "FAQ schema on each", "Link from the docs nav"] },
    yt: { title: "A 90-second setup video", body: "Your signup drop-off looks like it's at the install step. A short video usually fixes that.", v: "Low", d: "Medium", c: `${pct(45, 58)}%`, a: "No", f: "+6% signup completion", fm: "Effort medium", plan: ["Script it from your docs", "Screen capture, no face", "Embed on signup", "Measure for 3 weeks"] },
  };

  return { domain, name, nodeData, oppData };
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

const CONTENT_BODY_VARIANTS = {
  Pillar: (name) => [
    `${name} doesn't need to be complicated. This page covers what buyers actually ask, in plain language, before they ever talk to you.`,
    `A straight answer to "what is this and why should I care," aimed at someone who has thirty seconds and a real problem.`,
    `Leads with the outcome, not the feature list — what changes for you once ${name} is running.`,
  ],
  Support: () => [
    "A shorter supporting piece that answers one specific question well, and links back to the pillar page.",
    "Goes deep on one edge case the pillar page only mentions in passing.",
    "Written as a direct answer to a question people actually type into search.",
  ],
  Compare: (name) => [
    `An honest, factual comparison — what ${name} does differently, without trashing anyone.`,
    "A feature-by-feature table with the tradeoffs stated plainly, including where the other option wins.",
  ],
  Answer: () => [
    "Short, quotable definitions written the way answer engines prefer to cite them.",
    "One clean paragraph per question, no fluff before the answer.",
  ],
  Outreach: () => [
    "A pitch to an editor or publication that already covers your space.",
    "Leads with a specific, timely angle instead of a generic pitch.",
  ],
  Digest: () => ["Your weekly summary — what shipped, what's waiting on you, what changed."],
  Upkeep: () => ["Refreshing older pages that have gone stale, so they keep ranking."],
};

export function rewriteContentBody(kind, name, rewriteCount) {
  const variants = (CONTENT_BODY_VARIANTS[kind] || CONTENT_BODY_VARIANTS.Support)(name);
  return variants[(rewriteCount || 0) % variants.length];
}

// The activity log records only things that actually happened. At setup that
// means one entry: the real fetch of the user's site. Everything after it is
// written when the user themselves does something (queues a play, marks a
// piece published, approves an item). Nothing invents completed work — no
// "fixed your meta descriptions", no "keyword entered the top 10".
export function baseActivitySeed(domain) {
  return [
    {
      k: "seo",
      text: `Read ${domain} and set up your workspace`,
      why: "Fetched the homepage for its title and description — no tags installed, no forms filled",
      result: "Done",
    },
  ];
}
