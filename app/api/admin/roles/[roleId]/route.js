import { adminDb } from "../../../../../lib/firebaseAdmin";
import { adminRoute, ok, reply } from "../../../../../lib/adminApi";
import { readJson, z } from "../../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../../lib/adminAudit";
import { isBuiltIn, validateRole } from "../../../../../lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string().max(60)).max(40).optional(),
});

async function load(roleId) {
  if (!ID.test(roleId)) return { error: reply(400, "Not a role id.") };
  if (isBuiltIn(roleId)) return { error: reply(400, "Built-in roles can't be changed.") };
  const ref = adminDb().collection("roles").doc(roleId);
  const snap = await ref.get();
  if (!snap.exists) return { error: reply(404, "No such role.") };
  return { ref, role: snap.data() };
}

/**
 * Edits a custom role. The change applies at once everywhere the role is held:
 * the server reads roles on each request, and so do the Firestore rules.
 */
export const PATCH = adminRoute("platform.roles.manage", async ({ request, admin, params }) => {
  const found = await load(params.roleId);
  if (found.error) return found.error;
  const body = await readJson(request, Patch);
  if (!body.ok) return body.response;
  const next = { ...found.role, ...body.data };
  const problem = validateRole(next);
  if (problem) return reply(400, problem);
  await found.ref.update({ ...body.data, updatedAt: new Date(), updatedBy: admin.uid });
  await recordAdminAction({
    admin,
    request,
    action: "role.update",
    targetType: "role",
    targetId: params.roleId,
    targetLabel: next.name,
    before: { name: found.role.name, permissions: found.role.permissions },
    after: { name: next.name, permissions: next.permissions },
  });
  return ok();
});

// How many organisations to look through for a role still in use before
// giving up and refusing, rather than scanning without end.
const MAX_ORGS_SCANNED = 2000;

/**
 * Deletes a custom role, only if nobody holds it: deleting a role someone has
 * would leave them with no permissions at all, silently.
 */
export const DELETE = adminRoute("platform.roles.manage", async ({ request, admin, params }) => {
  const found = await load(params.roleId);
  if (found.error) return found.error;
  const db = adminDb();
  if (found.role.scope === "platform") {
    const held = await db.collection("platformAdmins").where("roleId", "==", params.roleId).limit(1).get();
    if (!held.empty) return reply(409, "An admin still holds this role. Give them another first.");
  } else {
    const orgs = await db.collection("orgs").select().limit(MAX_ORGS_SCANNED).get();
    for (const o of orgs.docs) {
      // eslint-disable-next-line no-await-in-loop
      const held = await o.ref.collection("members").where("roleId", "==", params.roleId).limit(1).get();
      if (!held.empty) return reply(409, "Someone still holds this role. Give them another first.");
    }
    if (orgs.size >= MAX_ORGS_SCANNED) return reply(409, "Too many organisations to check this role isn't in use. Leave it in place.");
  }
  await found.ref.delete();
  await recordAdminAction({ admin, request, action: "role.delete", targetType: "role", targetId: params.roleId, targetLabel: found.role.name, before: found.role, after: null });
  return ok();
});
