// Which of an account's sites its plan actually covers. Server-only.
//
// Sites are created straight from the browser, and the Firestore rules cannot
// count documents, so the plan's maxSites has only ever been enforced in the
// dashboard. Anything that spends money therefore has to ask here first: is
// this a real site, and is it one of the ones the plan pays for? The scheduler
// and every metered route ask the same question the same way, so a site can't
// be inside the plan for one and outside it for the other.

/** A Firestore Timestamp, Date or ISO string as milliseconds; missing counts as oldest. */
export function millisOf(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  const p = Date.parse(ts);
  return Number.isNaN(p) ? 0 : p;
}

/**
 * The sites a plan covers: the oldest `maxSites`, so which ones are covered is
 * stable and doesn't depend on the order Firestore happened to return them in.
 * Ties fall back to the id for the same reason.
 */
export function sitesInsidePlan(sites, plan) {
  return [...sites]
    .sort((a, b) => millisOf(a.createdAt) - millisOf(b.createdAt) || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, plan?.maxSites ?? 0));
}

// Firestore's own auto-ids are 20 of these. Anything else, and in particular
// anything with a "/" in it, is not a site id this product ever made, and a
// slash would let a caller address a different document path.
export const SITE_ID = /^[A-Za-z0-9_-]{1,128}$/;

// Reading every site on every paid call is the price of enforcing the limit on
// the server. Capped so an account that has created thousands of junk site
// documents can't make each of its own requests expensive for us.
const MAX_SITES_READ = 500;

/**
 * Is `siteId` a real site on this account, inside the plan's limit?
 *
 * Returns { ok: true, site } or { ok: false, status, code, reason }.
 */
export async function siteForPaidWork(db, orgId, siteId, plan) {
  if (typeof siteId !== "string" || !SITE_ID.test(siteId)) {
    return { ok: false, status: 400, code: "bad_site", reason: "No valid site was given." };
  }
  const snap = await db
    .collection("users").doc(orgId)
    .collection("sites")
    .select("createdAt", "url")
    .limit(MAX_SITES_READ)
    .get();
  const sites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return { ok: false, status: 404, code: "no_site", reason: "That site isn't on your account." };
  }
  if (!sitesInsidePlan(sites, plan).some((s) => s.id === siteId)) {
    return {
      ok: false,
      status: 402,
      code: "over_site_limit",
      reason: `${plan.name} covers ${plan.maxSites} site${plan.maxSites === 1 ? "" : "s"}, and this one is beyond that. Remove a site or upgrade to work on it.`,
    };
  }
  return { ok: true, site, siteIds: sites.map((s) => s.id) };
}
