import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, reply } from "../../../../../lib/adminApi";
import { readJson, z } from "../../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../../lib/adminAudit";
import { changeMemberRole, removeMember, transferOwnership } from "../../../../../lib/orgs";
import { issueLicense, revokeLicense, updateLicense } from "../../../../../lib/licenses";
import { activePlan } from "../../../../../lib/entitlements";
import { FLAGGABLE, invalidatePlatformCache } from "../../../../../lib/platform";
import { has } from "../../../../../lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** One organisation: members, invitations, licence, this month's usage against it, and the licence's history. */
export const GET = adminRoute("platform.orgs.read", async ({ params }) => {
  if (!ID.test(params.orgId)) return reply(400, "Not an organisation id.");
  const db = adminDb();
  const ref = db.collection("orgs").doc(params.orgId);
  const [org, members, invites, history, usage, sites] = await Promise.all([
    ref.get(),
    ref.collection("members").limit(500).get(),
    ref.collection("invites").where("status", "==", "pending").limit(100).get(),
    ref.collection("licenseHistory").orderBy("at", "desc").limit(25).get(),
    db.collection("users").doc(params.orgId).collection("usage").doc(monthKey()).get(),
    db.collection("users").doc(params.orgId).collection("sites").select("url", "createdAt").limit(200).get(),
  ]);
  if (!org.exists) return reply(404, "No such organisation.");
  const d = org.data();
  const plan = activePlan(d.subscription);
  const u = usage.exists ? usage.data() : {};
  const allowance = (k) => plan[k] || 0;

  return ok({
    org: {
      id: org.id,
      name: d.name,
      status: d.status,
      ownerUid: d.ownerUid,
      personal: !!d.personal,
      memberCount: d.memberCount || members.size,
      createdAt: iso(d.createdAt),
      flags: d.flags || {},
    },
    licence: d.subscription
      ? {
          ...d.subscription,
          startsAt: iso(d.subscription.startsAt),
          currentPeriodStart: iso(d.subscription.currentPeriodStart),
          currentPeriodEnd: iso(d.subscription.currentPeriodEnd),
          updatedAt: iso(d.subscription.updatedAt),
          trialEndsAt: iso(d.subscription.trialEndsAt),
          trialStartedAt: iso(d.subscription.trialStartedAt),
          revokedAt: iso(d.subscription.revokedAt),
        }
      : null,
    effectivePlan: {
      id: plan.id,
      name: plan.name,
      overridden: !!plan.overridden,
      seats: plan.seats ?? 1,
      maxSites: plan.maxSites,
      credits: plan.credits,
      leadCredits: plan.leadCredits,
      contentPieces: plan.contentPieces,
      socialPosts: plan.socialPosts,
      features: plan.features,
    },
    seatsUsed: (d.memberCount || members.size) + invites.size,
    members: members.docs.map((m) => ({ uid: m.id, email: m.data().email || null, displayName: m.data().displayName || null, roleId: m.data().roleId, joinedAt: iso(m.data().joinedAt) })),
    invites: invites.docs.map((i) => ({ id: i.id, email: i.data().email, roleId: i.data().roleId, createdAt: iso(i.data().createdAt), expiresAt: iso(i.data().expiresAt) })),
    usage: {
      month: monthKey(),
      rows: ["credits", "leadCredits", "contentPieces", "socialPosts"].map((k) => ({ key: k, used: u[k] || 0, allowance: allowance(k) })),
      costUsd: Math.round((u.costUsd || 0) * 100) / 100,
    },
    sites: sites.docs.map((s) => ({ id: s.id, url: s.data().url, createdAt: iso(s.data().createdAt) })),
    history: history.docs.map((h) => ({ id: h.id, action: h.data().action, actorUid: h.data().actorUid, note: h.data().note || null, at: iso(h.data().at), before: h.data().before?.plan || null, after: h.data().after?.plan || null })),
  });
});

const Date_ = z.string().max(40).nullish();
const Overrides = z
  .object({
    credits: z.number().int().min(0).nullish(),
    leadCredits: z.number().int().min(0).nullish(),
    contentPieces: z.number().int().min(0).nullish(),
    socialPosts: z.number().int().min(0).nullish(),
    maxSites: z.number().int().min(0).nullish(),
    seats: z.number().int().min(1, "At least one seat.").nullish(),
    maxAutonomy: z.number().int().min(0).max(100).nullish(),
    featuresAdd: z.array(z.string().max(40)).max(20).nullish(),
    featuresRemove: z.array(z.string().max(40)).max(20).nullish(),
  })
  .nullish();

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("suspend"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("transfer_ownership"), toUid: z.string().regex(ID) }),
  z.object({ action: z.literal("set_member_role"), uid: z.string().regex(ID), roleId: z.string().max(64) }),
  z.object({ action: z.literal("remove_member"), uid: z.string().regex(ID) }),
  z.object({ action: z.literal("withdraw_invite"), inviteId: z.string().regex(ID) }),
  z.object({ action: z.literal("set_flags"), flags: z.record(z.string(), z.boolean().nullable()) }),
  z.object({ action: z.literal("license_issue"), plan: z.string().max(40), startsAt: Date_, endsAt: z.string().max(40), overrides: Overrides, note: z.string().max(500).nullish() }),
  z.object({ action: z.literal("license_update"), plan: z.string().max(40).optional(), startsAt: Date_, endsAt: z.string().max(40).optional(), overrides: Overrides, note: z.string().max(500).nullish() }),
  z.object({ action: z.literal("license_revoke"), reason: z.string().max(500).optional() }),
]);

const LICENCE_ACTIONS = new Set(["license_issue", "license_update", "license_revoke"]);

/**
 * Changes one organisation. Licence actions need licenses.manage on top of
 * orgs.write; flags need flags.manage. Every branch writes the audit log.
 */
export const POST = adminRoute("platform.orgs.write", async ({ request, admin, params }) => {
  if (!ID.test(params.orgId)) return reply(400, "Not an organisation id.");
  const body = await readJson(request, Action);
  if (!body.ok) return body.response;
  const input = body.data;
  const db = adminDb();
  const ref = db.collection("orgs").doc(params.orgId);
  const org = await ref.get();
  if (!org.exists) return reply(404, "No such organisation.");
  const label = org.data().name;
  const audit = (action, before, after, note) =>
    recordAdminAction({ admin, request, action, targetType: "org", targetId: params.orgId, targetLabel: label, before, after, note });

  if (LICENCE_ACTIONS.has(input.action) && !has(admin.permissions, "platform.licenses.manage")) {
    return reply(403, "Your role doesn't allow changing licences.");
  }
  if (input.action === "set_flags" && !has(admin.permissions, "platform.flags.manage")) {
    return reply(403, "Your role doesn't allow changing feature flags.");
  }

  switch (input.action) {
    case "rename": {
      await ref.update({ name: input.name, nameLower: input.name.toLowerCase(), updatedAt: FieldValue.serverTimestamp() });
      await audit("org.rename", { name: label }, { name: input.name });
      return ok();
    }
    case "suspend": {
      if (org.data().status === "suspended") return reply(409, "Already suspended.");
      await ref.update({ status: "suspended", suspendedAt: FieldValue.serverTimestamp(), suspendedReason: input.reason || null });
      await audit("org.suspend", { status: org.data().status }, { status: "suspended" }, input.reason);
      return ok();
    }
    case "reactivate": {
      await ref.update({ status: "active", suspendedAt: FieldValue.delete(), suspendedReason: FieldValue.delete() });
      await audit("org.reactivate", { status: org.data().status }, { status: "active" });
      return ok();
    }
    case "transfer_ownership": {
      const res = await transferOwnership(db, { orgId: params.orgId, toUid: input.toUid });
      if (!res.ok) return reply(400, res.error);
      await audit("org.transfer_ownership", { ownerUid: res.before }, { ownerUid: res.after });
      return ok();
    }
    case "set_member_role": {
      const res = await changeMemberRole(db, { orgId: params.orgId, uid: input.uid, roleId: input.roleId });
      if (!res.ok) return reply(400, res.error);
      await audit("org.change_member_role", { uid: input.uid, roleId: res.before }, { uid: input.uid, roleId: res.after });
      return ok();
    }
    case "remove_member": {
      const res = await removeMember(db, { orgId: params.orgId, uid: input.uid });
      if (!res.ok) return reply(400, res.error);
      await audit("org.remove_member", { uid: input.uid, roleId: res.before?.roleId }, null);
      return ok();
    }
    case "withdraw_invite": {
      const inv = ref.collection("invites").doc(input.inviteId);
      const snap = await inv.get();
      if (!snap.exists || snap.data().status !== "pending") return reply(404, "No pending invitation with that id.");
      await inv.update({ status: "withdrawn", withdrawnAt: FieldValue.serverTimestamp(), withdrawnBy: admin.uid });
      await audit("org.withdraw_invite", { email: snap.data().email, status: "pending" }, { status: "withdrawn" });
      return ok();
    }
    case "set_flags": {
      const before = org.data().flags || {};
      const after = { ...before };
      for (const [k, v] of Object.entries(input.flags)) {
        if (!FLAGGABLE.includes(k)) return reply(400, `Unknown feature "${k}".`);
        if (v === null) delete after[k];
        else after[k] = v;
      }
      await ref.update({ flags: after, updatedAt: FieldValue.serverTimestamp() });
      invalidatePlatformCache();
      await audit("org.set_flags", before, after);
      return ok({ flags: after });
    }
    case "license_issue": {
      const res = await issueLicense(db, { orgId: params.orgId, ...input, actorUid: admin.uid });
      if (!res.ok) return reply(400, res.error);
      await audit("license.issue", res.before, res.after, input.note);
      return ok();
    }
    case "license_update": {
      const res = await updateLicense(db, { orgId: params.orgId, ...input, actorUid: admin.uid });
      if (!res.ok) return reply(400, res.error);
      await audit(input.plan !== undefined ? "license.change_plan" : "license.update", res.before, res.after, input.note);
      return ok();
    }
    case "license_revoke": {
      const res = await revokeLicense(db, { orgId: params.orgId, reason: input.reason, actorUid: admin.uid });
      if (!res.ok) return reply(400, res.error);
      await audit("license.revoke", res.before, res.after, input.reason);
      return ok();
    }
    default:
      return reply(400, "Unknown action.");
  }
});

