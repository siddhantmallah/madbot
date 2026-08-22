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

export function buildSiteInsights(site) {
  const domain = hostnameOf(site.url || "yoursite.com");
  const name = siteDisplayName(site);
  const rand = hashSeed(domain);
  const pct = (min, max) => Math.round(min + rand() * (max - min));

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

  const leadData = [
    { co: "Northwind Logistics", meta: `${pct(80, 200)} staff · Rotterdam`, why: "A public signal matching your ideal customer profile appeared this week", fit: "Hot", state: "Draft ready" },
    { co: "Bramble Health", meta: `${pct(40, 120)} staff · Leeds`, why: "Hiring for a role that suggests they have your problem", fit: "Hot", state: "Sent Tue" },
    { co: "Kestrel Payments", meta: `${pct(100, 300)} staff · Austin`, why: "Asked a question you solve in a public community", fit: "Warm", state: "Opened 3×" },
    { co: "Fen & Co", meta: `${pct(20, 60)} staff · Bristol`, why: "Two matching signals in the same week", fit: "Warm", state: "Queued" },
    { co: "Ardent Labs", meta: `${pct(30, 90)} staff · Berlin`, why: "Left a competitor a one-star review", fit: "Hot", state: "Replied" },
    { co: "Solstice Retail", meta: `${pct(200, 600)} staff · Toronto`, why: "Public status/news suggests they need this now", fit: "Cool", state: "Watching" },
  ];

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayData = dayNames.map((d, i) => {
    const items = [];
    if (i === 0) items.push({ title: `${name}: the definitive guide`, kind: "Pillar", meta: `${pct(1200, 2200)}w` });
    if (i === 1) items.push({ title: "A vs. B, plainly", kind: "Support", meta: `${pct(600, 1100)}w` });
    if (i === 2) { items.push({ title: `${name} vs. a competitor`, kind: "Compare", meta: "needs you" }); items.push({ title: "Glossary: 8 terms", kind: "Answer", meta: "auto" }); }
    if (i === 3) items.push({ title: "What breaks without this", kind: "Support", meta: `${pct(800, 1400)}w` });
    if (i === 4) { items.push({ title: "Guest post pitch", kind: "Outreach", meta: "awaiting you" }); items.push({ title: "Friday digest to you", kind: "Digest", meta: "9:00" }); }
    if (i === 6) items.push({ title: "Refresh: stale posts", kind: "Upkeep", meta: "auto" });
    return { name: d, date: String(12 + i), items };
  });

  const engineNames = ["ChatGPT", "Perplexity", "Google AI", "Claude", "Copilot", "Gemini"];
  const engineData = engineNames.map((n, i) => {
    const val = Math.max(3, pct(5, 75) - i * pct(2, 8));
    return { name: n, val, delta: `+${pct(3, 35)}` };
  });

  return { domain, name, nodeData, oppData, leadData, dayData, engineData };
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
