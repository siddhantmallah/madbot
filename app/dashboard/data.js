export const BASE_FEED = [
  { id: "b1", m: 2, k: "content", text: 'Published "SSL expiry alerts: the 2026 guide" — 1,840 words, 4 internal links', undo: true, why: "Owns a 2.4k/mo keyword you had nothing for", result: "Live" },
  { id: "b2", m: 14, k: "lead", text: "Found 6 unanswered threads about certificate monitoring on r/sysadmin", tag: "Needs you", why: "Public claim — your rules say ask first", result: "Waiting" },
  { id: "b3", m: 40, k: "seo", text: "Fixed 11 missing meta descriptions and 3 orphan pages", undo: true, why: "Technical debt suppressing 19 pages", result: "+9 impressions" },
  { id: "b4", m: 62, k: "link", text: "Listed CertNotify in 4 cybersecurity directories", tag: "+2 links", why: "Rivals are in all four", result: "+2 links" },
  { id: "b5", m: 188, k: "lead", text: "Scored 43 orgs with expiring certs — routed 12 to outreach", tag: "Auto", why: "Cert expiry inside 30 days", result: "12 queued" },
  { id: "b6", m: 300, k: "seo", text: "Refreshed 3 stale posts and added FAQ schema to 9 pages", undo: true, why: "Answer engines cite schema-marked pages", result: "+2 citations" },
  { id: "b7", m: 420, k: "win", text: '"ssl expiry alert tool" entered the top 10 — #7 from nowhere', tag: "Win", why: "Pillar page + 7 internal links", result: "#7" },
  { id: "b8", m: 610, k: "content", text: "Drafted a comparison page against uptimekit.io", undo: true, why: "They shipped pricing; shoppers compare", result: "Draft" },
  { id: "b9", m: 900, k: "link", text: "Pitched 5 blogs that link to certwatch.dev but not you", tag: "Outreach", why: "Same audience, easy swap", result: "2 replies" },
  { id: "b10", m: 1320, k: "seo", text: "Rebuilt your sitemap and submitted 24 pages", undo: true, why: "Google had 6 of your 30 pages", result: "24 indexed" },
];

export const POOL_FEED = [
  { k: "seo", text: "Added FAQ schema to 6 documentation pages", undo: true, why: "Answer engines cite schema-marked pages", result: "Live" },
  { k: "win", text: '"tls monitoring alerts" just entered the top 10 — #9', tag: "Win", why: "Supporting article cluster landed", result: "#9" },
  { k: "lead", text: "Scored 9 new orgs with certs expiring in 21 days", tag: "Auto", why: "Fresh expiry signal", result: "9 queued" },
  { k: "content", text: 'Drafted "Wildcard vs SAN certificates, plainly"', undo: true, why: "Question asked 400×/mo, nobody answers it well", result: "Draft" },
  { k: "link", text: "Pitched 3 blogs that link to certwatch.dev", tag: "Outreach", why: "Same readers, better product", result: "Sent" },
  { k: "win", text: 'Perplexity now cites you for "cert expiry alerts"', tag: "Win", why: "Quotable definition + schema", result: "Cited" },
  { k: "seo", text: "Compressed 34 images — homepage now loads in 0.9s", undo: true, why: "Speed is a ranking input", result: "−1.4s" },
];

export const DEFAULT_RULES = [
  { id: "r1", text: "Never say we're SOC 2 certified." },
  { id: "r2", text: "Never email the same person twice in 30 days." },
  { id: "r3", text: "Ask before anything costs money." },
  { id: "r4", text: "No competitor names in ad copy." },
];

export const NODE_DATA = [
  { id: "kw", x: 322, y: 176, d: 100, label: '"certificate expiry monitoring"', bg: "var(--color-accent)", fg: "var(--color-bg)", fs: "11.5px" },
  { id: "reddit", x: 88, y: 200, d: 80, label: "r/sysadmin thread", bg: "var(--color-accent-2-500)", fg: "var(--color-bg)", fs: "11px" },
  { id: "orgs", x: 392, y: 348, d: 90, label: "12 orgs, certs expiring <30d", bg: "var(--color-accent-400)", fg: "var(--color-accent-900)", fs: "10.5px" },
  { id: "dead", x: 152, y: 392, d: 72, label: "4 dead links on cyber blogs", bg: "var(--color-accent-2-300)", fg: "var(--color-accent-2-900)", fs: "10px" },
  { id: "vs", x: 306, y: 452, d: 64, label: "vs. UptimeKit", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)", fs: "10px" },
  { id: "gloss", x: 246, y: 92, d: 58, label: "TLS glossary", bg: "var(--color-neutral-300)", fg: "var(--color-text)", fs: "9.5px" },
  { id: "pr", x: 512, y: 250, d: 54, label: "PR: outage season", bg: "var(--color-neutral-200)", fg: "var(--color-text)", fs: "9px" },
  { id: "faq", x: 62, y: 320, d: 48, label: "FAQ hub", bg: "var(--color-neutral-200)", fg: "var(--color-text)", fs: "9px" },
  { id: "yt", x: 372, y: 74, d: 42, label: "Video", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)", fs: "9px" },
];

export const OPP_DATA = {
  kw: { title: '"certificate expiry monitoring"', body: "2,400 searches a month, buyer intent, and nobody has written a decent page for it. Your own docs already answer half of it.", v: "High", d: "Low", c: "78%", a: "No", f: "+120 visits/mo by week 7", fm: "Effort low · confidence 78% · no approval needed", plan: ["Write the pillar page", "3 supporting articles + FAQ schema", "Internal links from 7 existing pages", "Pitch 4 blogs that link to rivals"] },
  reddit: { title: "6 unanswered r/sysadmin threads", body: "People asking exactly what you solve, with nobody helpful replying. Worth a real answer, not a pitch.", v: "Medium", d: "Low", c: "64%", a: "Yes — public", f: "+40 visits and goodwill", fm: "Public communication · you send it", plan: ["Draft one honest reply each", "You approve the tone", "Post over 6 days, never all at once", "Link only where it helps"] },
  orgs: { title: "12 orgs with certs expiring inside 30 days", body: "Public certificate transparency logs say these teams have a deadline. That is the whole pitch.", v: "High", d: "Low", c: "71%", a: "No", f: "3–4 demos booked", fm: "Outreach · 40/day cap · your rules apply", plan: ["Verify each expiry date", "Write one email per company", "Send the free rollover checklist", "Stop after one follow-up"] },
  dead: { title: "4 dead links on cybersecurity blogs", body: "Four editors are linking to pages that no longer exist. You have a better page for each.", v: "Medium", d: "Low", c: "81%", a: "No", f: "+4 referring domains", fm: "Effort low · confidence 81%", plan: ["Confirm each broken link", "Match your closest page", "One short, useful email", "Track and never chase twice"] },
  vs: { title: "Comparison page vs. UptimeKit", body: "They just shipped pricing, so shoppers are comparing right now. Fair, factual, no trash talk.", v: "Medium", d: "Medium", c: "59%", a: "Yes — claims", f: "+70 high-intent visits/mo", fm: "Under 60% confident, so you decide", plan: ["Pull both feature sets honestly", "Write the page", "You check every claim", "Publish and monitor"] },
  gloss: { title: "A TLS glossary hub", body: "Cheap to make, gets cited by answer engines, and feeds internal links to everything else.", v: "Low", d: "Low", c: "86%", a: "No", f: "+30 visits/mo, slow burn", fm: "Effort low · compounding", plan: ["24 short definitions", "Schema-mark every one", "Link to your product pages", "Refresh quarterly"] },
  pr: { title: "Outage-season commentary", body: "Every autumn the big outage stories run. Being quotable in one is worth a year of blogging.", v: "High", d: "High", c: "34%", a: "Yes", f: "One tier-1 mention, maybe", fm: "Low confidence, high ceiling", plan: ["Prepare a data angle", "Build a journalist list", "You approve every quote", "Pitch in the window"] },
  faq: { title: "A real FAQ hub", body: "Nine of your support answers deserve public pages. Free traffic and fewer tickets.", v: "Medium", d: "Low", c: "77%", a: "No", f: "+55 visits/mo, −12 tickets", fm: "Effort low · confidence 77%", plan: ["Mine your support inbox", "Write 9 pages", "FAQ schema on each", "Link from the docs nav"] },
  yt: { title: "A 90-second setup video", body: "Your signup drop-off is at the install step. A short video usually fixes that.", v: "Low", d: "Medium", c: "52%", a: "No", f: "+6% signup completion", fm: "Effort medium · confidence 52%", plan: ["Script it from your docs", "Screen capture, no face", "Embed on signup", "Measure for 3 weeks"] },
};

export const LEAD_DATA = [
  { co: "Northwind Logistics", meta: "140 staff · Rotterdam", why: "Wildcard cert on app.northwind.io expires in 19 days", fit: "Hot", state: "Draft ready" },
  { co: "Bramble Health", meta: "80 staff · Leeds", why: "Hiring a platform engineer; job post mentions TLS incidents", fit: "Hot", state: "Sent Tue" },
  { co: "Kestrel Payments", meta: "210 staff · Austin", why: "Asked about cert monitoring in a public Slack community", fit: "Warm", state: "Opened 3×" },
  { co: "Fen & Co", meta: "35 staff · Bristol", why: "Two certs expiring in the same week in March", fit: "Warm", state: "Queued" },
  { co: "Ardent Labs", meta: "60 staff · Berlin", why: "Left a competitor a one-star review about missed alerts", fit: "Hot", state: "Replied" },
  { co: "Solstice Retail", meta: "480 staff · Toronto", why: "Public status page shows a cert-related outage last month", fit: "Cool", state: "Watching" },
];

export const DAY_DATA = [
  { name: "Mon", date: "12", items: [{ title: "SSL expiry alerts: the 2026 guide", kind: "Pillar", meta: "1,840w" }, { title: "Directory: SecTools", kind: "Link", meta: "auto" }] },
  { name: "Tue", date: "13", items: [{ title: "Wildcard vs SAN, plainly", kind: "Support", meta: "900w" }] },
  { name: "Wed", date: "14", items: [{ title: "CertNotify vs UptimeKit", kind: "Compare", meta: "needs you" }, { title: "TLS glossary: 8 terms", kind: "Answer", meta: "auto" }] },
  { name: "Thu", date: "15", items: [{ title: "What breaks when a cert expires", kind: "Support", meta: "1,100w" }] },
  { name: "Fri", date: "16", items: [{ title: "Guest post: The New Stack", kind: "Outreach", meta: "awaiting you" }, { title: "Friday digest to you", kind: "Digest", meta: "9:00" }] },
  { name: "Sat", date: "17", items: [] },
  { name: "Sun", date: "18", items: [{ title: "Refresh: 3 stale posts", kind: "Upkeep", meta: "auto" }] },
];

export const APPR_DATA = [
  { id: "a1", kind: "Public communication", when: "waiting 4 hours", title: "Guest post pitch to The New Stack", body: "I wrote 1,200 words on what actually happens during a certificate outage, and a short pitch email to their editor. Your name goes on it, so you send it.", forecast: "One tier-1 backlink", conf: "Confidence 48% · no cost", yes: "Send it", rule: "Rule: anything public goes past you" },
  { id: "a2", kind: "Spend", when: "waiting 1 day", title: "$240/mo listing on CyberDirectory", body: "Both rivals are listed and it sends real trial signups, not just a link. Cancellable monthly, and I would review it in 8 weeks.", forecast: "+90 visits/mo", conf: "Confidence 61% · $240/mo", yes: "Approve the spend", rule: "Rule: ask before anything costs money" },
  { id: "a3", kind: "Low confidence", when: "waiting 2 days", title: "Comparison page against UptimeKit", body: "It needs factual claims about someone else's product, and I'm only 59% sure I have their feature list right. Check me before this goes out.", forecast: "+70 high-intent visits/mo", conf: "Confidence 59% · under your 60% floor", yes: "Looks right — publish", rule: "Rule: under 60% sure, I don't act alone" },
];

export const ENGINE_DATA = [
  { name: "ChatGPT", val: 72, delta: "+38" },
  { name: "Perplexity", val: 54, delta: "+29" },
  { name: "Google AI", val: 38, delta: "+18" },
  { name: "Claude", val: 21, delta: "+21" },
  { name: "Copilot", val: 14, delta: "+9" },
  { name: "Gemini", val: 9, delta: "+4" },
];

export function ago(m) {
  if (m < 1) return "just now";
  if (m < 60) return m + " min";
  if (m < 1440) return Math.round(m / 60) + " hr";
  return Math.round(m / 1440) + " d";
}

export function kindColor(k) {
  return (
    {
      seo: "var(--color-accent-200)",
      content: "var(--color-accent-300)",
      lead: "var(--color-accent-2-200)",
      link: "var(--color-neutral-300)",
      win: "var(--color-accent-2-500)",
    }[k] || "var(--color-neutral-200)"
  );
}

export function autInfo(v) {
  if (v < 25) return { label: "Watch only", desc: "I look, I report, I touch nothing at all." };
  if (v < 48) return { label: "Suggest", desc: "A plan on your desk each morning. You press the buttons." };
  if (v < 80) return { label: "Let it rip", desc: "I publish, distribute and prospect on my own. I ask before spending." };
  return { label: "Full send", desc: "I spend too, inside your budget, and hand you the receipts." };
}

export const SCREEN_TITLES = {
  growth: "Growth",
  opps: "Opportunities",
  content: "Content & calendar",
  leads: "Lead discovery",
  appr: "Approvals",
  vis: "AI search visibility",
  aut: "Autonomy & permissions",
  log: "Activity log",
};
