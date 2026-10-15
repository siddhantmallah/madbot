import { adminRoute, ok } from "../../../../lib/adminApi";
import { FEATURE_LABELS, PLANS, PLAN_ORDER } from "../../../../lib/plans";
import { OVERRIDABLE_LIMITS } from "../../../../lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The plans licences are issued against. Read-only: plans are defined in
 * lib/plans.js and published on the pricing page (decided 2026-10-14). What an
 * admin changes is one organisation's licence, with overrides.
 */
export const GET = adminRoute("platform.orgs.read", async () =>
  ok({
    plans: PLAN_ORDER.map((id) => {
      const p = PLANS[id];
      return {
        id,
        name: p.name,
        price: p.price,
        maxSites: p.maxSites,
        seats: p.seats,
        credits: p.credits,
        leadCredits: p.leadCredits,
        contentPieces: p.contentPieces,
        socialPosts: p.socialPosts,
        maxAutonomy: p.maxAutonomy,
        features: p.features,
      };
    }),
    overridable: OVERRIDABLE_LIMITS,
    featureLabels: FEATURE_LABELS,
  })
);
