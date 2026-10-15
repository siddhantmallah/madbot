import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, reply } from "../../../../../lib/adminApi";
import { readJson, z } from "../../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../../lib/adminAudit";
import { platformRoleOf } from "../../../../../lib/adminAuth";
import { canActOnAdmin } from "../../../../../lib/rbac";
import { addMember, changeMemberRole, getRole, membershipsOf, removeMember } from "../../../../../lib/orgs";
import { buildAdminResetEmail, sendEmail } from "../../../../../lib/email";
import { SITE_URL } from "../../../../../lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID = /^[A-Za-z0-9_-]{1,128}$/;
const ORG = z.string().regex(UID);

/** One person: their account, profile, organisations, platform role and what the console has done to them. */
export const GET = adminRoute("platform.users.read", async ({ params }) => {
  if (!UID.test(params.uid)) return reply(400, "Not a user id.");
  const db = adminDb();
  let account = null;
  try {
    account = await adminAuth().getUser(params.uid);
  } catch {
    // A profile without an account (deleted in Firebase directly) still shows.
  }
  const [profile, memberships, platformRole, audit] = await Promise.all([
    db.collection("users").doc(params.uid).get(),
    membershipsOf(db, params.uid),
    platformRoleOf(params.uid),
    // No orderBy: equality plus a sort needs a composite index, and fifty
    // rows sort in memory for free.
    db.collection("adminAudit").where("targetId", "==", params.uid).limit(50).get(),
  ]);
  if (!account && !profile.exists) return reply(404, "No such user.");
  const p = profile.exists ? profile.data() : {};
  return ok({
    user: {
      uid: params.uid,
      email: account?.email || p.email || null,
      displayName: account?.displayName || p.displayName || null,
      emailVerified: !!account?.emailVerified,
      disabled: !!account?.disabled,
      status: p.status || (account?.disabled ? "suspended" : "active"),
      providers: (account?.providerData || []).map((x) => x.providerId),
      createdAt: account?.metadata?.creationTime || iso(p.createdAt),
      lastSignInAt: account?.metadata?.lastSignInTime || null,
      lastRefreshAt: account?.metadata?.lastRefreshTime || null,
      deletedAt: iso(p.deletedAt),
      platformRole: platformRole ? { roleId: platformRole.roleId, source: platformRole.source } : null,
    },
    memberships,
    activity: audit.docs
      .map((d) => ({ id: d.id, action: d.data().action, actorEmail: d.data().actorEmail, note: d.data().note, at: iso(d.data().at) }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))),
  });
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("reactivate") }),
  // Typed back by the admin: the account's email, so a stray click can't delete.
  z.object({ action: z.literal("delete"), confirm: z.string().max(320) }),
  z.object({ action: z.literal("reset_password") }),
  z.object({ action: z.literal("add_to_org"), orgId: ORG, roleId: z.string().max(64) }),
  z.object({ action: z.literal("set_org_role"), orgId: ORG, roleId: z.string().max(64) }),
  z.object({ action: z.literal("remove_from_org"), orgId: ORG }),
]);

/**
 * Changes one person. Every branch writes the audit log with the values before
 * and after. Platform admins can only be acted on by someone who manages
 * admins, and owners (ADMIN_UIDS) by nobody.
 */
export const POST = adminRoute("platform.users.write", async ({ request, admin, params }) => {
  if (!UID.test(params.uid)) return reply(400, "Not a user id.");
  const body = await readJson(request, Action);
  if (!body.ok) return body.response;
  const input = body.data;
  const uid = params.uid;
  const db = adminDb();

  const targetRole = await platformRoleOf(uid);
  if (targetRole && !canActOnAdmin(admin, { uid, roleId: targetRole.roleId })) {
    return reply(403, uid === admin.uid ? "You can't do that to your own account here." : "That account is a platform admin; only someone who manages admins can change it, and nobody can change an owner.");
  }

  let account = null;
  try {
    account = await adminAuth().getUser(uid);
  } catch {
    if (!["remove_from_org"].includes(input.action)) return reply(404, "No such account.");
  }
  const label = account?.email || uid;
  const userRef = db.collection("users").doc(uid);
  const audit = (action, before, after, note) => recordAdminAction({ admin, request, action, targetType: "user", targetId: uid, targetLabel: label, before, after, note });

  switch (input.action) {
    case "suspend": {
      if (account.disabled) return reply(409, "Already suspended.");
      await adminAuth().updateUser(uid, { disabled: true });
      await adminAuth().revokeRefreshTokens(uid);
      await userRef.set({ status: "suspended", suspendedAt: FieldValue.serverTimestamp() }, { merge: true });
      await audit("user.suspend", { disabled: false }, { disabled: true }, input.reason);
      return ok({ disabled: true });
    }
    case "reactivate": {
      const before = (await userRef.get()).data()?.status || (account.disabled ? "suspended" : "active");
      await adminAuth().updateUser(uid, { disabled: false });
      await userRef.set({ status: FieldValue.delete(), suspendedAt: FieldValue.delete(), deletedAt: FieldValue.delete() }, { merge: true });
      await audit("user.reactivate", { status: before }, { status: "active" });
      return ok({ disabled: false });
    }
    case "delete": {
      // Soft: the account is disabled and marked, and everything stays, so it
      // can be reactivated. Erasing data is the person's own right, exercised
      // from their dashboard (/api/privacy/delete), not an admin shortcut.
      if (String(input.confirm).trim().toLowerCase() !== String(account.email || uid).toLowerCase()) {
        return reply(400, "Type the account's email address exactly to confirm.");
      }
      await adminAuth().updateUser(uid, { disabled: true });
      await adminAuth().revokeRefreshTokens(uid);
      await userRef.set({ status: "deleted", deletedAt: FieldValue.serverTimestamp(), deletedBy: admin.uid }, { merge: true });
      await audit("user.soft_delete", { status: "active" }, { status: "deleted" });
      return ok({ status: "deleted" });
    }
    case "reset_password": {
      if (!account.email) return reply(400, "This account has no email address to send a reset to.");
      if (!(account.providerData || []).some((p) => p.providerId === "password")) {
        return reply(400, "This account signs in with Google or GitHub, so there's no MADBOT password to reset.");
      }
      const link = await adminAuth().generatePasswordResetLink(account.email, { url: `${SITE_URL}/login` });
      // Signed out everywhere now, so the old password stops working the
      // moment the new one is set rather than whenever tokens expire.
      await adminAuth().revokeRefreshTokens(uid);
      const mail = buildAdminResetEmail({ link });
      const sent = await sendEmail({ to: account.email, ...mail });
      await audit("user.force_password_reset", null, { emailSent: !!sent.ok });
      if (!sent.ok) return reply(502, "Signed them out, but the reset email couldn't be sent. Try again.");
      return ok({ emailed: account.email });
    }
    case "add_to_org": {
      const role = await getRole(db, input.roleId);
      const res = await addMember(db, { orgId: input.orgId, uid, email: account.email, displayName: account.displayName, roleId: input.roleId });
      if (!res.ok) return reply(400, res.error);
      await audit("user.add_to_org", null, { orgId: input.orgId, roleId: input.roleId, roleName: role?.name });
      return ok();
    }
    case "set_org_role": {
      const res = await changeMemberRole(db, { orgId: input.orgId, uid, roleId: input.roleId });
      if (!res.ok) return reply(400, res.error);
      await audit("user.change_org_role", { orgId: input.orgId, roleId: res.before }, { orgId: input.orgId, roleId: res.after });
      return ok();
    }
    case "remove_from_org": {
      const res = await removeMember(db, { orgId: input.orgId, uid });
      if (!res.ok) return reply(400, res.error);
      await audit("user.remove_from_org", { orgId: input.orgId, roleId: res.before?.roleId }, null);
      return ok();
    }
    default:
      return reply(400, "Unknown action.");
  }
});
