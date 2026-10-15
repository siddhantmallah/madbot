// Licences, as the admin console manages them. Server-only.
//
// A licence is the organisation's `subscription`: the shape every enforcement
// point already reads (entitlements.activePlan), extended with what an admin
// sets per organisation:
//
//   plan          a plan id from lib/plans.js; plans themselves stay in code
//   status        active | trialing | past_due | revoked | expired | ...
//   startsAt      before this, the licence entitles nothing (activePlan)
//   currentPeriodEnd   the expiry date
//   overrides     per-organisation limits: credits, leadCredits, contentPieces,
//                 socialPosts, maxSites, seats, maxAutonomy, featuresAdd,
//                 featuresRemove (entitlements.withOverrides)
//
// Every change writes orgs/{id}/licenseHistory with before and after, beside
// the platform audit log entry the route writes, so a licence's own page
// can show its history without searching the whole audit log.

import { FieldValue } from "firebase-admin/firestore";
import { PLANS } from "./plans";
import { OVERRIDABLE_LIMITS } from "./entitlements";

/** Overrides with nothing but known, sane values. Pure. */
export function cleanOverrides(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of OVERRIDABLE_LIMITS) {
    const v = raw[key];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 10_000_000) out[key] = key === "maxAutonomy" ? Math.min(n, 100) : n;
  }
  const features = new Set(Object.values(PLANS).flatMap((p) => p.features));
  for (const key of ["featuresAdd", "featuresRemove"]) {
    if (Array.isArray(raw[key])) {
      const list = [...new Set(raw[key].filter((f) => features.has(f)))];
      if (list.length) out[key] = list;
    }
  }
  return Object.keys(out).length ? out : null;
}

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function write(db, orgId, mutate, { action, actorUid, note }) {
  const ref = db.collection("orgs").doc(orgId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: "No such organisation." };
    const before = snap.data().subscription || null;
    const result = mutate(before);
    if (!result.ok) return result;
    const after = { ...result.subscription, updatedAt: new Date() };
    tx.update(ref, { subscription: after, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ref.collection("licenseHistory").doc(), {
      action,
      before,
      after,
      actorUid: actorUid || null,
      note: note || null,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true, before, after };
  });
}

/** A new licence, replacing whatever was there. */
export async function issueLicense(db, { orgId, plan, startsAt = null, endsAt, overrides = null, note = null, actorUid }) {
  if (!Object.hasOwn(PLANS, plan) || !PLANS[plan].purchasable) return { ok: false, error: "Pick one of the published plans." };
  const start = asDate(startsAt) || new Date();
  const end = asDate(endsAt);
  if (!end || end <= start) return { ok: false, error: "The licence has to end after it starts." };
  return write(
    db,
    orgId,
    () => ({
      ok: true,
      subscription: {
        plan,
        status: "active",
        provider: "manual",
        startsAt: start,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        overrides: cleanOverrides(overrides),
        licenseId: `lic_${Date.now().toString(36)}`,
        grantedBy: actorUid || null,
        note,
      },
    }),
    { action: "license.issue", actorUid, note }
  );
}

/**
 * Changes an existing licence: move it to another plan (upgrade or
 * downgrade), change its dates, its seats or its overrides. Anything not
 * passed is left as it was.
 */
export async function updateLicense(db, { orgId, plan, startsAt, endsAt, overrides, note = null, actorUid }) {
  return write(
    db,
    orgId,
    (current) => {
      if (!current?.plan) return { ok: false, error: "This organisation has no licence to change. Issue one first." };
      if (plan !== undefined && (!Object.hasOwn(PLANS, plan) || !PLANS[plan].purchasable)) return { ok: false, error: "Pick one of the published plans." };
      const next = { ...current };
      if (plan !== undefined) next.plan = plan;
      if (startsAt !== undefined) next.startsAt = asDate(startsAt);
      if (endsAt !== undefined) {
        const end = asDate(endsAt);
        if (!end) return { ok: false, error: "That isn't a date." };
        next.currentPeriodEnd = end;
      }
      if (overrides !== undefined) next.overrides = cleanOverrides(overrides);
      const start = next.startsAt || next.currentPeriodStart;
      const startMs = start?.toMillis ? start.toMillis() : start ? new Date(start).getTime() : 0;
      const endMs = next.currentPeriodEnd?.toMillis ? next.currentPeriodEnd.toMillis() : new Date(next.currentPeriodEnd).getTime();
      if (startMs && endMs && endMs <= startMs) return { ok: false, error: "The licence has to end after it starts." };
      // Bringing a revoked or expired licence back is a deliberate act.
      if (["revoked", "expired"].includes(next.status) && endMs > Date.now()) next.status = "active";
      if (note) next.note = note;
      return { ok: true, subscription: next };
    },
    { action: plan !== undefined ? "license.change_plan" : "license.update", actorUid, note }
  );
}

/** Ends a licence now. The organisation drops to the lapsed tier at once. */
export async function revokeLicense(db, { orgId, reason, actorUid }) {
  return write(
    db,
    orgId,
    (current) => {
      if (!current?.plan) return { ok: false, error: "There's no licence to revoke." };
      return { ok: true, subscription: { ...current, status: "revoked", revokedAt: new Date(), revokedReason: reason || null } };
    },
    { action: "license.revoke", actorUid, note: reason }
  );
}
