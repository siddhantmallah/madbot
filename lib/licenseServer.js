// Server-side licence enforcement. This is the gate that actually matters —
// the dashboard's greyed-out buttons are a courtesy, and anyone can call an API
// route directly.
//
// Identity comes from Google; the organisation, the caller's role in it and
// the licence come from Firestore via the admin SDK. None of them is ever
// taken from the request body, because the caller is exactly the party with an
// interest in lying about all of them.

import { adminAvailable, adminDb } from "./firebaseAdmin";
import { featureAccess, activePlan } from "./entitlements";
import { verifyIdentity } from "./apiGuard";
import { orgContext } from "./orgs";
import { has } from "./rbac";
import { featureEnabled, platformFlags, platformSettings } from "./platform";
import { FEATURE_LABELS } from "./plans";

/**
 * Resolves an ID token to a uid. Returns null for anything it can't verify,
 * including a token that was revoked or belongs to a disabled account.
 */
export async function verifiedUid(idToken) {
  return (await verifyIdentity(idToken))?.uid || null;
}

/**
 * An organisation's licence. Organisations hold it from 2026-10-14; an
 * account that hasn't signed in since then has no organisation document yet,
 * so the scheduler falls back to the licence still on its user document, which
 * is the same licence (orgs.ensurePersonalOrg copies it across).
 */
export async function subscriptionFor(orgId) {
  if (!adminAvailable()) return { unavailable: true, subscription: null };
  try {
    const db = adminDb();
    const org = await db.collection("orgs").doc(orgId).get();
    if (org.exists) {
      const status = org.data()?.status;
      // A suspended organisation runs nothing, scheduled work included.
      if (status && status !== "active") return { unavailable: false, subscription: null, suspended: true };
      return { unavailable: false, subscription: org.data()?.subscription || null, flags: org.data()?.flags || null };
    }
    const legacy = await db.collection("users").doc(orgId).get();
    return { unavailable: false, subscription: legacy.exists ? legacy.data()?.subscription || null : null };
  } catch (err) {
    return { unavailable: true, subscription: null, error: String(err?.message || err) };
  }
}

/**
 * The one call a product route needs: who is calling, which organisation they
 * are acting for, whether their role there allows this, and whether the
 * licence and the feature flags do.
 *
 * `permission` is an org permission key from lib/rbac.js. It defaults to
 * "work.run" for a licensed feature and "sites.read" otherwise.
 *
 * Returns { ok: true, uid, orgId, org, permissions, plan, subscription,
 * emailVerified } or { ok: false, status, error, code?, upgradeTo? }.
 *
 * Fails closed. Without a service account the server can't tell whose
 * organisation anything is, and guessing gives the product away.
 */
export async function authorize(idToken, feature, { permission } = {}) {
  const who = await verifyIdentity(idToken);
  if (!who) return { ok: false, status: 401, error: "Could not verify your account." };
  if (!adminAvailable()) {
    return { ok: false, status: 503, error: "Licence checks are unavailable — the server's Firebase service account isn't configured." };
  }

  // Maintenance mode, set in /admin: the product stops taking work. The
  // console, the crons and the public pages keep running.
  const settings = await platformSettings();
  if (settings.maintenance?.on) {
    return { ok: false, status: 503, code: "maintenance", error: settings.maintenance.message || "MADBOT is down for maintenance. Nothing has been charged; try again shortly." };
  }

  const ctx = await orgContext(adminDb(), who);
  if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.error, code: ctx.code };

  const need = permission || (feature ? "work.run" : "sites.read");
  if (!has(ctx.permissions, need)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      error: `Your role in ${ctx.org.name || "this organisation"} doesn't allow that. Ask an owner or admin.`,
    };
  }

  const subscription = ctx.org.subscription || null;
  const base = { ok: true, uid: who.uid, orgId: ctx.orgId, org: ctx.org, permissions: ctx.permissions, emailVerified: who.emailVerified };
  if (!feature) return { ...base, plan: activePlan(subscription), subscription };

  const verdict = featureAccess(subscription, feature);
  if (!verdict.allowed) {
    return { ok: false, status: 402, error: verdict.reason, upgradeTo: verdict.upgradeTo, upgradeName: verdict.upgradeName };
  }

  // A flag only ever takes a feature away; the licence decides what's granted.
  if (!featureEnabled(await platformFlags(), ctx.org.flags, feature)) {
    return {
      ok: false,
      status: 503,
      code: "feature_disabled",
      error: `${FEATURE_LABELS[feature] || "This feature"} is switched off for now. Nothing has been charged.`,
    };
  }

  return { ...base, plan: activePlan(subscription), subscription };
}
