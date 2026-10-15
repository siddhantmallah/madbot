import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, reply } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { ownerUids } from "../../../../lib/adminAuth";
import { OWNER_ROLE, SCOPES, canActOnAdmin } from "../../../../lib/rbac";
import { getRole } from "../../../../lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who can open the console: owners from ADMIN_UIDS, and everyone granted access here. */
export const GET = adminRoute("platform.dashboard.read", async () => {
  const db = adminDb();
  const rows = await db.collection("platformAdmins").limit(200).get();
  const owners = ownerUids();
  const uids = [...new Set([...owners, ...rows.docs.map((d) => d.id)])];
  const accounts = uids.length ? (await adminAuth().getUsers(uids.map((uid) => ({ uid })))).users : [];
  const byUid = new Map(accounts.map((a) => [a.uid, a]));
  const docs = new Map(rows.docs.map((d) => [d.id, d.data()]));
  return ok({
    admins: uids.map((uid) => {
      const row = docs.get(uid) || {};
      return {
        uid,
        email: byUid.get(uid)?.email || row.email || null,
        roleId: owners.includes(uid) ? OWNER_ROLE.platform : row.roleId || null,
        source: owners.includes(uid) ? "env" : "console",
        status: owners.includes(uid) ? "active" : row.status || "revoked",
        mfaEnrolled: !!row.totpSecret,
        lastSignInAt: iso(row.lastSignInAt),
      };
    }),
  });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), email: z.email().max(320), roleId: z.string().max(64) }),
  z.object({ action: z.literal("revoke"), uid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }),
  z.object({ action: z.literal("reset_mfa"), uid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }),
]);

/**
 * Grants, changes or revokes console access, or makes someone set up their
 * authenticator again. Owners come from ADMIN_UIDS and can't be changed here;
 * nobody can act on their own access.
 */
export const POST = adminRoute("platform.admins.manage", async ({ request, admin }) => {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const input = body.data;
  const db = adminDb();

  if (input.action === "grant") {
    const role = await getRole(db, input.roleId);
    if (!role || role.scope !== SCOPES.PLATFORM) return reply(400, "Pick a platform role.");
    if (input.roleId === OWNER_ROLE.platform) return reply(400, "Owners are set in ADMIN_UIDS, not from the console.");
    let account;
    try {
      account = await adminAuth().getUserByEmail(input.email.toLowerCase());
    } catch {
      return reply(404, "No account has that email address. They need to sign up first.");
    }
    if (ownerUids().includes(account.uid)) return reply(400, "That account is already an owner.");
    if (account.uid === admin.uid) return reply(400, "You can't change your own access.");
    const ref = db.collection("platformAdmins").doc(account.uid);
    const before = (await ref.get()).data() || null;
    await ref.set({ uid: account.uid, email: account.email, roleId: input.roleId, status: "active", source: "console", grantedBy: admin.uid, grantedAt: FieldValue.serverTimestamp() }, { merge: true });
    await recordAdminAction({ admin, request, action: "admin.grant", targetType: "admin", targetId: account.uid, targetLabel: account.email, before: before ? { roleId: before.roleId, status: before.status } : null, after: { roleId: input.roleId, status: "active" } });
    return ok();
  }

  const ref = db.collection("platformAdmins").doc(input.uid);
  const row = (await ref.get()).data();
  if (ownerUids().includes(input.uid)) {
    if (input.action === "revoke") return reply(400, "Owners are set in ADMIN_UIDS, not from the console.");
  } else if (!row) {
    return reply(404, "That account isn't an admin.");
  }
  if (!canActOnAdmin(admin, { uid: input.uid, roleId: ownerUids().includes(input.uid) ? OWNER_ROLE.platform : row?.roleId })) {
    // Resetting an owner's authenticator is allowed for another owner only;
    // canActOnAdmin refuses owners, so handle that one case explicitly.
    if (!(input.action === "reset_mfa" && admin.roleId === OWNER_ROLE.platform && input.uid !== admin.uid)) {
      return reply(403, "You can't change that admin's access.");
    }
  }

  if (input.action === "revoke") {
    await ref.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedBy: admin.uid });
    await adminAuth().revokeRefreshTokens(input.uid).catch(() => {});
    await recordAdminAction({ admin, request, action: "admin.revoke", targetType: "admin", targetId: input.uid, targetLabel: row.email, before: { roleId: row.roleId, status: row.status }, after: { status: "revoked" } });
    return ok();
  }

  // reset_mfa: the next sign-in enrols a new authenticator, and every session
  // they have now ends.
  await ref.set({ totpSecret: FieldValue.delete(), totpPending: FieldValue.delete(), totpLastStep: FieldValue.delete(), mfaResetBy: admin.uid, mfaResetAt: FieldValue.serverTimestamp() }, { merge: true });
  await adminAuth().revokeRefreshTokens(input.uid).catch(() => {});
  await recordAdminAction({ admin, request, action: "admin.reset_mfa", targetType: "admin", targetId: input.uid, targetLabel: row?.email || input.uid });
  return ok();
});
