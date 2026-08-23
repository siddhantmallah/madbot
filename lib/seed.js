// Deterministic per-site "insights" generator. The underlying automation is
// simulated (no real crawling/SEO/lead-gen happens), but every site gets its
// own stable numbers and copy instead of one shared demo dataset.

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

export function siteDisplayName(site) {
  const host = hostnameOf(site.url || "");
  return site.title && site.title !== site.url ? site.title : host;
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

  const engineNames = ["ChatGPT", "Perplexity", "Google AI", "Claude", "Copilot", "Gemini"];
  const engineData = engineNames.map((n, i) => {
    const val = Math.max(3, pct(5, 75) - i * pct(2, 8));
    return { name: n, val, delta: `+${pct(3, 35)}` };
  });

  return { domain, name, nodeData, oppData, engineData };
}

// Per-site, seeded-but-stable numbers for the Growth screen's stat cards —
// still simulated, but no longer identical for every account.
export function growthStats(site) {
  const domain = hostnameOf(site.url || "yoursite.com");
  const pct = pctFactory(domain + ":growth");
  const visitPct = pct(18, 62);
  return {
    organicPct: `+${visitPct}%`,
    bars: [pct(20, 40), pct(30, 50), pct(25, 45), pct(45, 65), pct(55, 75), 100],
    prospects: pct(15, 60),
    prospectsMeta: `${pct(6, 20)} opened · ${pct(2, 8)} replied · ${pct(0, 3)} demos booked`,
    referring: pct(5, 25),
    referringMeta: `${pct(0, 4)} above DR 60`,
    indexed: pct(10, 30),
    indexedMeta: `of ${pct(10, 30)} submitted`,
    scoreboard: [
      { label: "Organic visitors / mo", delta: "trending up", before: `${pct(30, 55)}%`, now: `${pct(65, 90)}%` },
      { label: "Keywords in the top 10", delta: "trending up", before: `${pct(10, 25)}%`, now: `${pct(55, 75)}%` },
      { label: "Qualified leads / mo", delta: "trending up", before: `${pct(5, 15)}%`, now: `${pct(75, 95)}%` },
    ],
  };
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

// Materialized once at site creation — flattened out of the weekly-calendar
// shape into individual persisted content items.
export function contentSeeds(site) {
  const domain = hostnameOf(site.url || "yoursite.com");
  const name = shortSiteName(site);
  const pct = pctFactory(domain + ":content");
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rows = [];
  const push = (day, title, kind, meta) => {
    const body = (CONTENT_BODY[kind] || (() => ""))(name);
    rows.push({ day, dayName: dayNames[day], date: String(12 + day), title, kind, meta, body, status: "draft" });
  };
  push(0, `${name}: the definitive guide`, "Pillar", `${pct(1200, 2200)}w`);
  push(1, "A vs. B, plainly", "Support", `${pct(600, 1100)}w`);
  push(2, `${name} vs. a competitor`, "Compare", "needs you");
  push(2, "Glossary: 8 terms", "Answer", "auto");
  push(3, "What breaks without this", "Support", `${pct(800, 1400)}w`);
  push(4, "Guest post pitch", "Outreach", "awaiting you");
  push(4, "Friday digest to you", "Digest", "9:00");
  push(6, "Refresh: stale posts", "Upkeep", "auto");
  return rows;
}

const LEAD_TEMPLATES = [
  { co: "Northwind Logistics", meta: "Rotterdam", why: "A public signal matching your ideal customer profile appeared this week", fit: "Hot" },
  { co: "Bramble Health", meta: "Leeds", why: "Hiring for a role that suggests they have your problem", fit: "Hot" },
  { co: "Kestrel Payments", meta: "Austin", why: "Asked a question you solve in a public community", fit: "Warm" },
  { co: "Fen & Co", meta: "Bristol", why: "Two matching signals in the same week", fit: "Warm" },
  { co: "Ardent Labs", meta: "Berlin", why: "Left a competitor a one-star review", fit: "Hot" },
  { co: "Solstice Retail", meta: "Toronto", why: "Public status/news suggests they need this now", fit: "Cool" },
];

// Materialized once at site creation — each lead gets its own persisted
// outreach draft so Send/Edit/Never actually mean something.
export function leadSeeds(site) {
  const domain = hostnameOf(site.url || "yoursite.com");
  const name = shortSiteName(site);
  const pct = pctFactory(domain + ":leads");
  return LEAD_TEMPLATES.map((t) => ({
    co: t.co,
    meta: `${pct(20, 400)} staff · ${t.meta}`,
    why: t.why,
    fit: t.fit,
    draft: `Hi — noticed something that suggests you have this problem right now. Not selling you anything today: here's something genuinely useful from ${name} first…`,
  }));
}

export const ACTIVITY_POOL = (domain, name) => [
  { k: "seo", text: `Compressed images across ${domain} — homepage loads noticeably faster`, undo: true, why: "Speed is a ranking input", result: "faster load" },
  { k: "content", text: `Drafted a comparison page against a close competitor`, undo: true, why: "A rival just changed something public; shoppers compare", result: "Draft" },
  { k: "lead", text: `Scored new companies matching your ideal customer profile`, tag: "Auto", why: "Fresh signal detected", result: "queued" },
  { k: "win", text: `A buying-intent keyword just entered the top 10`, tag: "Win", why: "Pillar page + internal links landed", result: "top 10" },
  { k: "link", text: `Pitched sites that link to a rival but not to ${domain}`, tag: "Outreach", why: "Same audience, easy swap", result: "sent" },
  { k: "seo", text: "Refreshed stale posts and added FAQ schema", undo: true, why: "Answer engines cite schema-marked pages", result: "updated" },
  { k: "win", text: `An AI answer engine now cites ${name} for a buyer question`, tag: "Win", why: "Quotable definition + schema", result: "cited" },
];

export function baseActivitySeed(domain, name) {
  return [
    { m: 1, k: "seo", text: `Read ${domain} and mapped growth opportunities`, why: "First pass — no tags installed, no forms filled", result: "Done" },
    { m: 12, k: "content", text: `Drafted "${name}: the definitive guide" — first pillar page`, undo: true, why: "Owns a keyword you had nothing for", result: "Draft" },
    { m: 40, k: "seo", text: "Fixed missing meta descriptions and orphan pages", undo: true, why: "Technical debt suppressing indexed pages", result: "improved" },
    { m: 62, k: "link", text: `Listed ${name} in a few relevant directories`, tag: "+links", why: "Rivals are already listed", result: "listed" },
    { m: 188, k: "lead", text: "Scored companies matching your ideal customer profile", tag: "Auto", why: "Public signal detected", result: "queued" },
  ];
}

export function approvalSeeds(domain, name) {
  return [
    { kind: "Public communication", title: "Guest post pitch to a relevant publication", body: `I wrote a piece relevant to your space and a short pitch email to their editor. Your name goes on it, so you send it.`, forecast: "One relevant backlink", conf: "Confidence 48% · no cost", yes: "Send it", rule: "Rule: anything public goes past you" },
    { kind: "Spend", title: "Listing on a relevant directory", body: "Competitors are already listed and it sends real signups, not just a link. Cancellable monthly.", forecast: "+visits/mo", conf: "Confidence 61% · low monthly cost", yes: "Approve the spend", rule: "Rule: ask before anything costs money" },
    { kind: "Low confidence", title: `Comparison page against a competitor`, body: "It needs factual claims about someone else's product, and I'm not fully sure I have their details right. Check me before this goes out.", forecast: "+high-intent visits/mo", conf: "Confidence 59% · under your 60% floor", yes: "Looks right — publish", rule: "Rule: under 60% sure, I don't act alone" },
  ];
}
