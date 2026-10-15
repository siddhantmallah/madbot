import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok, reply } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { BUILT_IN_ROLES, PERMISSIONS, SCOPES, isBuiltIn, validateRole } from "../../../../lib/rbac";
import { ensureBuiltInRoles } from "../../../../lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every role, built-in and custom, with the permission catalogue they're made from. */
export const GET = adminRoute("platform.dashboard.read", async () => {
  const db = adminDb();
  await ensureBuiltInRoles(db);
  const snap = await db.collection("roles").limit(500).get();
  const custom = snap.docs
    .filter((d) => !isBuiltIn(d.id))
    .map((d) => ({ id: d.id, scope: d.data().scope, name: d.data().name, description: d.data().description || "", permissions: d.data().permissions || [], builtIn: false }));
  return ok({
    roles: [...Object.values(BUILT_IN_ROLES).map((r) => ({ ...r, builtIn: true })), ...custom],
    permissions: PERMISSIONS,
  });
});

const Body = z.object({
  scope: z.enum([SCOPES.PLATFORM, SCOPES.ORG]),
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string().max(60)).max(40),
});

/** A custom role, composed from permission keys of one scope. */
export const POST = adminRoute("platform.roles.manage", async ({ request, admin }) => {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const problem = validateRole(body.data);
  if (problem) return reply(400, problem);
  const ref = adminDb().collection("roles").doc();
  const role = { ...body.data, builtIn: false, createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid };
  await ref.set(role);
  await recordAdminAction({ admin, request, action: "role.create", targetType: "role", targetId: ref.id, targetLabel: body.data.name, after: body.data });
  return ok({ roleId: ref.id });
});
