// MADBOT Credits: the unit customers actually buy.
//
// The point of the indirection is that model prices and model choices will
// change, and a customer's plan shouldn't. They bought "1,500 autonomous
// actions a month", not a quantity of tokens from a particular vendor. When a
// cheaper model can do a job, the credit cost can come down without touching a
// price list or a single subscription record.
//
// Client-safe: no server imports.

/**
 * One credit is allowed to cost us this much in variable cost. Every credit
 * value below is derived from a measured or estimated USD cost divided by this
 * number, so the ladder holds its margin instead of drifting.
 *
 * Getting this wrong is expensive and silent. The first cut of this table put a
 * visibility check at 12 credits; it actually costs $0.569, so a Growth
 * customer spending their 1,500 credits on visibility checks would have cost
 * $71 against $45 of revenue. Priced from measurement now, not intuition.
 */
export const CREDIT_USD = 0.015;

const at = (usd) => Math.max(1, Math.round(usd / CREDIT_USD));

export const ACTIONS = {
  // — free of model cost: HTTP, parsing, matching. Credits here exist to rate
  //   limit, not to recover spend. —
  CRAWL_PAGE: { credits: 1, usd: 0, label: "Read a page" },
  AUDIT_SITE: { credits: 1, usd: 0, label: "Audit a site" },
  COMPETITOR_SNAPSHOT: { credits: 1, usd: 0, label: "Snapshot a competitor" },
  LEAD_DISCOVER: { credits: 1, usd: 0, label: "Find a company" },
  PAGE_CLASSIFY: { credits: at(0.004), usd: 0.004, label: "Classify a page" },

  // — a standard-tier model doing real work. —
  OUTREACH_DRAFT: { credits: at(0.016), usd: 0.016, label: "Draft an outreach email" },
  SEO_RECOMMEND: { credits: at(0.018), usd: 0.018, label: "Recommend a fix" },
  COMPETITOR_ANALYSE: { credits: at(0.022), usd: 0.022, label: "Analyse a competitor's move" },
  LEAD_ANALYSE: { credits: at(0.024), usd: 0.024, label: "Analyse a company in depth" },

  // — long output, or live web search, or both. —
  CONTENT_WRITE: { credits: at(0.082), usd: 0.082, label: "Write an article" },
  // Measured, not estimated: 74.8k in, 6.2k out, 4 billed searches.
  VISIBILITY_CHECK: { credits: at(0.569), usd: 0.569, label: "Run an AI visibility check" },
};

// Lead credits are metered separately from action credits, because the cost
// driver is different: a verified, enriched, scored lead consumes paid data as
// well as model time, and one customer asking for ten thousand of them is a
// different problem from one writing ten thousand words.
export const LEAD_CREDIT_PER_VERIFIED_LEAD = 1;

export function creditsFor(action) {
  const spec = ACTIONS[action];
  if (!spec) throw new Error(`Unknown action "${action}" — add it to ACTIONS in credits.js.`);
  return spec.credits;
}

export function actionLabel(action) {
  return ACTIONS[action]?.label || action;
}

/**
 * Top-ups, so hitting a limit mid-month is a purchase rather than a wall.
 * Prices are per region, keyed the same way as the plans.
 */
export const TOPUPS = {
  credits_100: { credits: 100, label: "100 credits", price: { IN: 99, US: 2, EU: 2, GB: 2 } },
  leads_100: { leadCredits: 100, label: "100 lead credits", price: { IN: 299, US: 5, EU: 5, GB: 4 } },
  emails_1000: { emails: 1000, label: "1,000 outreach emails", price: { IN: 149, US: 2, EU: 2, GB: 2 } },
  site_1: { sites: 1, label: "1 extra website", recurring: true, price: { IN: 499, US: 7, EU: 7, GB: 6 } },
};

/**
 * A usage figure rendered the way a customer thinks about it. "1,140 of 1,500
 * autonomous actions" reads as work done; "68% of token budget" reads as a
 * threat.
 */
export function describeUsage({ used, allowance }) {
  if (!allowance) return { text: "Not included on this plan", pct: 0, exhausted: true };
  const pct = Math.min(100, Math.round((used / allowance) * 100));
  return {
    text: `${used.toLocaleString()} of ${allowance.toLocaleString()}`,
    pct,
    exhausted: used >= allowance,
    // Worth warning before the wall, not at it.
    nearlyOut: pct >= 85 && used < allowance,
  };
}
