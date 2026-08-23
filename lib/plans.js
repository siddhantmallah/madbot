// The single source of truth for what each plan permits. The pricing page, the
// dashboard's gates, the cost controller and the server's enforcement all read
// this file, so a limit can't say one thing on the marketing page and another in
// the product.
//
// Client-safe: no server imports, no secrets.

export const FEATURES = {
  AUDIT: "audit",
  CRAWL: "crawl",
  OPPORTUNITIES: "opportunities",
  DIGEST: "digest",
  SEARCH_CONSOLE: "searchConsole",
  COMPETITORS: "competitors",
  CONTENT: "content",
  LEADS: "leads",
  OUTREACH: "outreach",
  AI_VISIBILITY: "aiVisibility",
  BUDGETS: "budgets",
  AUTO_PUBLISH: "autoPublish",
  INTEGRATIONS: "integrations",
};

// The autonomy dial is 0-100. These are the band ceilings used by autInfo() in
// the dashboard, so a plan's cap lines up exactly with the label the user sees
// on the dial rather than an invented parallel scale.
export const AUTONOMY_BANDS = [
  { max: 24, label: "Watch only" },
  { max: 47, label: "Suggest" },
  { max: 79, label: "Let it rip" },
  { max: 100, label: "Full send" },
];

export function autonomyLabel(value) {
  return (AUTONOMY_BANDS.find((b) => value <= b.max) || AUTONOMY_BANDS[AUTONOMY_BANDS.length - 1]).label;
}

// Regions we price in. INR is the home currency and the numbers below are the
// ones actually decided; the others are set higher deliberately — a developed
// market pays a developed-market price, which is the whole point of pricing by
// region rather than just converting.
export const REGIONS = {
  IN: { currency: "INR", symbol: "₹", label: "India" },
  US: { currency: "USD", symbol: "$", label: "United States" },
  EU: { currency: "EUR", symbol: "€", label: "Europe" },
  GB: { currency: "GBP", symbol: "£", label: "United Kingdom" },
};

export const DEFAULT_REGION = "US";

const CORE = [FEATURES.AUDIT, FEATURES.CRAWL, FEATURES.OPPORTUNITIES, FEATURES.DIGEST];

export const PLANS = {
  // Not a time-limited trial — a standing free tier. Enough to prove MADBOT
  // reads the site correctly, and not enough to run a business on.
  free: {
    id: "free",
    name: "Free",
    purchasable: true,
    price: { IN: 0, US: 0, EU: 0, GB: 0 },
    maxSites: 1,
    credits: 30,
    leadCredits: 10,
    emails: 0,
    contentPieces: 0,
    maxAutonomy: 24,
    features: CORE,
    tagline: "See what it finds",
    blurb: "One site, watched. It reports; it changes nothing.",
    highlights: ["1 website", "Daily monitoring", "Full opportunity map", "10 lead credits", "Nothing published"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    purchasable: true,
    price: { IN: 1499, US: 29, EU: 27, GB: 24 },
    annual: { IN: 14990, US: 290, EU: 270, GB: 240 },
    maxSites: 1,
    credits: 550,
    leadCredits: 50,
    emails: 100,
    contentPieces: 2,
    maxAutonomy: 47,
    features: [...CORE, FEATURES.SEARCH_CONSOLE, FEATURES.COMPETITORS, FEATURES.AI_VISIBILITY],
    tagline: "Your AI growth assistant",
    blurb: "One site, watched and advised. It finds the work and hands you the plan.",
    highlights: [
      "1 website",
      "50 prospects a month",
      "2 content pieces",
      "Competitor monitoring",
      "AI visibility tracking",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    purchasable: true,
    featured: true,
    price: { IN: 3999, US: 79, EU: 72, GB: 64 },
    annual: { IN: 39990, US: 790, EU: 720, GB: 640 },
    maxSites: 3,
    credits: 1450,
    leadCredits: 300,
    emails: 1000,
    contentPieces: 8,
    maxAutonomy: 79,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.OUTREACH,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
    ],
    tagline: "For businesses actively growing",
    blurb: "Three sites, publishing and prospecting on their own.",
    highlights: [
      "3 websites",
      "300 prospects a month",
      "8 content pieces",
      "Automated SEO fixes",
      "Email outreach",
      "Search Console",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    purchasable: true,
    price: { IN: 7999, US: 159, EU: 145, GB: 129 },
    annual: { IN: 79990, US: 1590, EU: 1450, GB: 1290 },
    maxSites: 10,
    credits: 2950,
    leadCredits: 1000,
    emails: 5000,
    contentPieces: 20,
    maxAutonomy: 100,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.OUTREACH,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
      FEATURES.BUDGETS,
      FEATURES.INTEGRATIONS,
    ],
    tagline: "An autonomous growth team",
    blurb: "Ten sites, full autonomy, standing budgets, publishing where you work.",
    highlights: [
      "10 websites",
      "1,000 prospects",
      "20 content pieces",
      "Automated publishing",
      "Outreach sequences",
      "Slack, GitHub and CMS",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    purchasable: true,
    price: { IN: 14999, US: 299, EU: 275, GB: 245 },
    annual: { IN: 149990, US: 2990, EU: 2750, GB: 2450 },
    maxSites: 25,
    credits: 5600,
    leadCredits: 3000,
    emails: 15000,
    contentPieces: 60,
    maxAutonomy: 100,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.OUTREACH,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
      FEATURES.BUDGETS,
      FEATURES.INTEGRATIONS,
    ],
    tagline: "Every client, one dashboard",
    blurb: "Twenty-five client sites, shared guardrails and voice, one place to see all of it.",
    highlights: [
      "25 client sites",
      "3,000 prospects",
      "60 content pieces",
      "Shared guardrails and voice",
      "Per-client reporting",
    ],
  },
  // What a lapsed subscription falls back to. Distinct from `free` so the UI can
  // tell "never paid" from "was paying and stopped".
  lapsed: {
    id: "lapsed",
    name: "No plan",
    purchasable: false,
    price: { IN: 0, US: 0, EU: 0, GB: 0 },
    maxSites: 1,
    credits: 0,
    leadCredits: 0,
    emails: 0,
    contentPieces: 0,
    maxAutonomy: 24,
    features: CORE,
    tagline: "Nothing running",
    blurb: "Your sites and everything found are still here. Nothing new runs until a plan is active.",
    highlights: [],
  },
};

export const PLAN_ORDER = ["free", "starter", "growth", "pro", "agency"];

export const TRIAL_DAYS = 14;

// The trial runs at Growth level whatever plan was clicked: it's the hero plan,
// it includes lead discovery and publishing, and a Starter-shaped trial would
// hide the things worth upgrading for. Three sites also lets an agency actually
// try the agency case.
export const TRIAL_PLAN = "growth";

export function planById(id) {
  return PLANS[id] || PLANS.lapsed;
}

/** Price for a plan in a region, falling back to the default region. */
export function priceFor(plan, region = DEFAULT_REGION, cycle = "monthly") {
  const table = cycle === "annual" ? plan.annual : plan.price;
  if (!table) return null;
  return table[region] ?? table[DEFAULT_REGION] ?? null;
}

export function formatPrice(amount, region = DEFAULT_REGION) {
  const r = REGIONS[region] || REGIONS[DEFAULT_REGION];
  if (amount === 0) return "Free";
  // Indian numbering groups differently, and getting it wrong looks careless to
  // exactly the customers this pricing is aimed at.
  const n = amount.toLocaleString(r.currency === "INR" ? "en-IN" : "en-US");
  return `${r.symbol}${n}`;
}

/**
 * Amount in the smallest currency unit, for billing records. Every currency
 * MADBOT prices in happens to have 100 minor units.
 */
export function minorUnits(amount) {
  return Math.round(amount * 100);
}

/**
 * Which features a plan has that another doesn't — drives the "here's what
 * changes" list so the end of a trial or a downgrade isn't a surprise.
 */
export function featuresLostOnDowngrade(fromPlanId, toPlanId) {
  const from = PLANS[fromPlanId];
  const to = PLANS[toPlanId];
  if (!from || !to) return [];
  return from.features.filter((f) => !to.features.includes(f));
}

export const FEATURE_LABELS = {
  audit: "Technical audit",
  crawl: "Site crawl",
  opportunities: "Opportunity map",
  digest: "Weekly digest",
  searchConsole: "Search Console",
  competitors: "Competitor watch",
  content: "Writing and publishing",
  leads: "Lead discovery",
  outreach: "Email outreach",
  aiVisibility: "AI visibility",
  budgets: "Standing budgets",
  autoPublish: "Autonomous publishing",
  integrations: "Slack, GitHub and CMS",
};

// A subscription only entitles anything while it's in one of these states.
// "past_due" still works: cutting a paying customer off the instant a card
// retry fails loses more than it protects.
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

/**
 * The cheapest purchasable plan that includes a feature — so a blocked action
 * can name the upgrade instead of saying "not available".
 */
export function cheapestPlanWith(feature) {
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (plan.purchasable && plan.features.includes(feature)) return plan;
  }
  return null;
}

export function cheapestPlanForSites(count) {
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (plan.purchasable && plan.maxSites >= count) return plan;
  }
  return null;
}

export function cheapestPlanForAutonomy(value) {
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (plan.purchasable && plan.maxAutonomy >= value) return plan;
  }
  return null;
}

/**
 * The customer-facing highlight list, with the numbers read from the plan
 * itself. Anything countable is derived rather than written out, so a limit
 * change can't leave a stale promise on the pricing page.
 */
export function highlightsFor(plan) {
  const out = [`${plan.maxSites} ${plan.maxSites === 1 ? "website" : "websites"}`];
  if (plan.credits) out.push(`${plan.credits.toLocaleString()} autonomous actions`);
  if (plan.leadCredits) out.push(`${plan.leadCredits.toLocaleString()} lead credits`);
  if (plan.contentPieces) out.push(`${plan.contentPieces} content pieces`);
  if (plan.emails) out.push(`${plan.emails.toLocaleString()} outreach emails`);
  return [...out, ...(plan.highlights || []).filter((h) => !/^\d/.test(h))];
}

export function cheapestPlanWithCredits(credits) {
  for (const id of PLAN_ORDER) {
    const plan = PLANS[id];
    if (plan.purchasable && plan.credits >= credits) return plan;
  }
  return null;
}
