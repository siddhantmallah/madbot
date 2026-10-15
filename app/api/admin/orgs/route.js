import { FieldPath } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, pageOf, pageSize, reply } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { createOrg } from "../../../../lib/orgs";
import { activePlan } from "../../../../lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summary(doc) {
  const d = doc.data();
  const plan = activePlan(d.subscription);
  return {
    id: doc.id,
    name: d.name,
    status: d.status,
    ownerUid: d.ownerUid,
    memberCount: d.memberCount || 1,
    seats: plan.seats ?? 1,
    plan: plan.id,
    planName: plan.name,
    licenceStatus: d.subscription?.status || null,
    licenceEnds: iso(d.subscription?.currentPeriodEnd),
    personal: !!d.personal,
    createdAt: iso(d.createdAt),
  };
}

/**
 * Organisations, a page at a time.
 *
 *   ?q=       name prefix, case-insensitive
 *   ?status=  all (default) | active | suspended
 */
export const GET = adminRoute("platform.orgs.read", async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const limit = pageSize(searchParams);
  const q = String(searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
  const status = searchParams.get("status") || "all";
  if (!["all", "active", "suspended"].includes(status)) return reply(400, "Unknown status filter.");

  const db = adminDb();
  let query = db.collection("orgs");
  if (q) query = query.where("nameLower", ">=", q).where("nameLower", "<", `${q}`).orderBy("nameLower");
  else if (status !== "all") query = query.where("status", "==", status);
  else query = query.where("status", "in", ["active", "suspended"]);
  query = query.orderBy(FieldPath.documentId());

  const { docs, next } = await pageOf(query, {
    limit,
    cursor: searchParams.get("cursor"),
    toCursorValues: (d) => (q ? [d.data().nameLower, d.id] : [d.id]),
  });
  const rows = docs.map(summary);
  return ok({ orgs: q && status !== "all" ? rows.filter((r) => r.status === status) : rows, next });
});

const Create = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80, "Names are 80 characters at most."),
  ownerEmail: z.email("The owner needs an email address.").max(320),
});

/** A new organisation, owned by an existing account. It starts with no licence: issue one next. */
export const POST = adminRoute("platform.orgs.write", async ({ request, admin }) => {
  const body = await readJson(request, Create);
  if (!body.ok) return body.response;
  let owner;
  try {
    owner = await adminAuth().getUserByEmail(body.data.ownerEmail.toLowerCase());
  } catch {
    return reply(404, "No account has that email address. They need to sign up first.");
  }
  const orgId = await createOrg(adminDb(), { name: body.data.name, ownerUid: owner.uid, ownerEmail: owner.email, ownerDisplayName: owner.displayName || null });
  await recordAdminAction({
    admin,
    request,
    action: "org.create",
    targetType: "org",
    targetId: orgId,
    targetLabel: body.data.name,
    after: { name: body.data.name, ownerUid: owner.uid, ownerEmail: owner.email },
  });
  return ok({ orgId });
});
