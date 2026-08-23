// The single source of truth for what each plan permits. The pricing page, the
// dashboard's gates and the server's enforcement all read this file, so a limit
// can't say one thing on the marketing page and another in the product.
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
  AI_VISIBILITY: "aiVisibility",
  BUDGETS: "budgets",
  AUTO_PUBLISH: "autoPublish",
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

const CORE = [FEATURES.AUDIT, FEATURES.CRAWL, FEATURES.OPPORTUNITIES, FEATURES.DIGEST];

export const PLANS = {
  // What you get before buying anything, and what you fall back to when a plan
  // lapses. Deliberately enough to prove MADBOT reads your site correctly, and
  // not enough to run a business on.
  trial: {
    id: "trial",
    name: "No plan yet",
    price: 0,
    purchasable: false,
    maxSites: 1,
    maxAutonomy: 47,
    features: CORE,
    blurb: "Audit and opportunity map for one site. Nothing is published or sent.",
  },
  // The free trial's own tier. Every feature, so the whole product is visible,
  // but three sites rather than ten — enough to prove the agency case, which is
  // what Swarm actually sells, without running an agency for free.
  trialing: {
    id: "trialing",
    name: "Free trial",
    price: 0,
    purchasable: false,
    maxSites: 3,
    maxAutonomy: 100,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
      FEATURES.BUDGETS,
    ],
    blurb: "Everything MADBOT does, across up to three sites.",
  },
  scout: {
    id: "scout",
    name: "Scout",
    price: 29,
    purchasable: true,
    maxSites: 1,
    maxAutonomy: 47,
    features: [...CORE, FEATURES.SEARCH_CONSOLE, FEATURES.COMPETITORS],
    blurb: "One site, watch and suggest. It finds everything and hands you the plan.",
  },
  madbot: {
    id: "madbot",
    name: "MADBOT",
    price: 79,
    purchasable: true,
    maxSites: 1,
    maxAutonomy: 79,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
    ],
    blurb: "One site, full autonomy. It publishes, distributes and prospects.",
  },
  swarm: {
    id: "swarm",
    name: "Swarm",
    price: 249,
    purchasable: true,
    maxSites: 10,
    maxAutonomy: 100,
    features: [
      ...CORE,
      FEATURES.SEARCH_CONSOLE,
      FEATURES.COMPETITORS,
      FEATURES.CONTENT,
      FEATURES.LEADS,
      FEATURES.AI_VISIBILITY,
      FEATURES.AUTO_PUBLISH,
      FEATURES.BUDGETS,
    ],
    blurb: "Up to ten client sites, standing budgets, one dashboard across all of them.",
  },
};

export const PLAN_ORDER = ["trial", "trialing", "scout", "madbot", "swarm"];

export const TRIAL_DAYS = 14;

// The trial runs at its own tier whatever plan was clicked. A Scout-shaped
// trial would never show content, leads or AI visibility, leaving nothing to
// upgrade to — and the free public report already covers the audit, so a
// feature-limited free tier demonstrates nothing new. Three sites because the
// agency case is what Swarm sells, and one site can't demonstrate it.
export const TRIAL_PLAN = "trialing";

/**
 * Which features a plan has that the trial shows but won't keep. Drives the
 * "here's what changes when the trial ends" list, so the end of the trial isn't
 * a surprise.
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
  aiVisibility: "AI visibility",
  budgets: "Standing budgets",
  autoPublish: "Autonomous publishing",
};

// A subscription only entitles anything while it's in one of these states.
// "past_due" still works: cutting a paying customer off the instant a card
// retry fails loses more than it protects.
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export function planById(id) {
  return PLANS[id] || PLANS.trial;
}

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
