import { NextResponse } from "next/server";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { fields, readJson, reply, requireUser, z } from "../../../../lib/apiGuard";
import { membershipsOf, orgContext, setActiveOrg } from "../../../../lib/orgs";
import { activePlan } from "../../../../lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  idToken: fields.idToken,
  // Only for switching. The server checks the membership before it is used,
  // and from then on resolves the organisation itself (lib/orgs.orgContext).
  switchTo: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});

/**
 * The signed-in person's organisation context: which organisation they are
 * acting for, their role and permissions in it, its plan, and every other
 * organisation they belong to. Creates their personal organisation on the
 * first call after organisations arrived (lib/orgs.ensurePersonalOrg), which
 * is what moves an existing account onto them with nothing to migrate.
 */
export async function POST(request) {
  if (!adminAvailable()) return reply(503, "No service account configured.");
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;

  const who = await requireUser(body.data.idToken);
  if (!who.ok) return who.response;
  const db = adminDb();

  if (body.data.switchTo) {
    const switched = await setActiveOrg(db, who.user.uid, body.data.switchTo);
    if (!switched) return reply(403, "You aren't a member of that organisation.");
  }

  // Closed signups are enforced inside orgContext (ensurePersonalOrg): a new
  // account gets no organisation, and so no product, while an existing
  // customer is still migrated.
  const ctx = await orgContext(db, who.user);
  const memberships = await membershipsOf(db, who.user.uid);
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, code: ctx.code, memberships }, { status: ctx.status });

  return NextResponse.json({
    ok: true,
    org: {
      id: ctx.orgId,
      name: ctx.org.name,
      status: ctx.org.status,
      ownerUid: ctx.org.ownerUid,
      memberCount: ctx.org.memberCount || 1,
      seats: activePlan(ctx.org.subscription).seats ?? 1,
    },
    role: { id: ctx.member.roleId, name: ctx.role?.name || ctx.member.roleId },
    permissions: ctx.permissions,
    memberships,
    maintenance: settings.maintenance?.on ? { message: settings.maintenance.message || "" } : null,
  });
}
