// Decides what a given subscription is allowed to do. Pure functions, no I/O —
// the same answers are used to grey out a button in the browser and to refuse
// the work on the server, so the two can never disagree.
//
// Every refusal names the plan that would allow it. "Not available on your
// plan" with no way forward is a dead end, not a product.

import {
  ACTIVE_STATUSES,
  PLANS,
  autonomyLabel,
  cheapestPlanForAutonomy,
  cheapestPlanForSites,
  cheapestPlanWith,
  planById,
} from "./plans";

/**
 * Resolves a stored subscription to the plan actually in force. An absent,
 * cancelled or expired subscription falls back to the trial entitlements
 * rather than to whatever was last paid for.
 */
export function activePlan(subscription) {
  if (!subscription?.plan) return PLANS.trial;
  if (!ACTIVE_STATUSES.includes(subscription.status)) return PLANS.trial;

  // A period that has already ended doesn't entitle anything, whatever the
  // stored status says — a missed webhook shouldn't hand out free service.
  const ends = toMillis(subscription.currentPeriodEnd);
  if (ends && ends < Date.now()) return PLANS.trial;

  return planById(subscription.plan);
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const ALLOW = { allowed: true, reason: null, upgradeTo: null };

function deny(reason, upgradeTo) {
  return { allowed: false, reason, upgradeTo: upgradeTo ? upgradeTo.id : null, upgradeName: upgradeTo?.name || null };
}

/** Whether a feature is usable, and what to buy if it isn't. */
export function featureAccess(subscription, feature) {
  const plan = activePlan(subscription);
  if (plan.features.includes(feature)) return ALLOW;
  const need = cheapestPlanWith(feature);
  return deny(
    need
      ? `Not included in ${plan.name}. ${need.name} covers this.`
      : `Not included in ${plan.name}.`,
    need
  );
}

/**
 * Whether another site can be connected. Enforced at the moment of adding, not
 * retroactively — someone who downgrades keeps seeing the sites they already
 * connected, they just can't add more.
 */
export function siteAccess(subscription, currentCount) {
  const plan = activePlan(subscription);
  if (currentCount < plan.maxSites) return ALLOW;
  const need = cheapestPlanForSites(currentCount + 1);
  return deny(
    need
      ? `${plan.name} covers ${plan.maxSites} site${plan.maxSites === 1 ? "" : "s"}. ${need.name} covers ${need.maxSites}.`
      : `${plan.name} covers ${plan.maxSites} site${plan.maxSites === 1 ? "" : "s"}. Talk to us about more.`,
    need
  );
}

/** Whether the autonomy dial may be pushed this far (0-100). */
export function autonomyAccess(subscription, value) {
  const plan = activePlan(subscription);
  if (value <= plan.maxAutonomy) return ALLOW;
  const need = cheapestPlanForAutonomy(value);
  return deny(
    `${plan.name} stops at "${autonomyLabel(plan.maxAutonomy)}".${need ? ` ${need.name} goes to "${autonomyLabel(need.maxAutonomy)}".` : ""}`,
    need
  );
}

/** Clamps a stored autonomy value down to what the plan permits. */
export function clampAutonomy(subscription, value) {
  const plan = activePlan(subscription);
  const n = Number(value);
  if (!Number.isFinite(n)) return plan.maxAutonomy;
  return Math.min(Math.max(n, 0), plan.maxAutonomy);
}

/** A compact summary for the billing screen. */
export function usageSummary(subscription, { siteCount = 0 } = {}) {
  const plan = activePlan(subscription);
  return {
    plan,
    status: subscription?.status || "none",
    siteCount,
    maxSites: plan.maxSites,
    sitesLeft: Math.max(0, plan.maxSites - siteCount),
    overSiteLimit: siteCount > plan.maxSites,
    renewsAt: subscription?.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!subscription?.cancelAtPeriodEnd,
    // Set when a licence was granted by hand rather than by a payment provider.
    grantedManually: subscription?.provider === "manual",
  };
}
