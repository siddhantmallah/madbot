import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok, reply } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { createInvite, getRole } from "../../../../lib/orgs";
import { buildInviteEmail, sendEmail } from "../../../../lib/email";
import { SITE_URL } from "../../../../lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.email("That isn't an email address.").max(320),
  orgId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Pick an organisation."),
  roleId: z.string().max(64).default("org_member"),
});

/**
 * Invites someone into an organisation. The invitation holds a seat while it
 * is pending, so the licence's seat limit can't be beaten by sending more
 * invitations than there are seats. The link carries a token whose hash alone
 * is stored; it works only for the invited address, once, within 14 days.
 */
export const POST = adminRoute("platform.users.write", async ({ request, admin }) => {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { email, orgId, roleId } = body.data;
  const db = adminDb();

  const org = await db.collection("orgs").doc(orgId).get();
  if (!org.exists) return reply(404, "No such organisation.");
  const role = await getRole(db, roleId);

  const invite = await createInvite(db, { orgId, email, roleId, invitedBy: admin.uid });
  if (!invite.ok) return reply(400, invite.error);

  const link = `${SITE_URL}/invite?org=${encodeURIComponent(orgId)}&invite=${encodeURIComponent(invite.inviteId)}&token=${encodeURIComponent(invite.token)}`;
  const mail = buildInviteEmail({ orgName: org.data().name, roleName: role?.name || roleId, link, days: 14 });
  const sent = await sendEmail({ to: email.toLowerCase(), ...mail });

  await recordAdminAction({
    admin,
    request,
    action: "user.invite",
    targetType: "org",
    targetId: orgId,
    targetLabel: org.data().name,
    after: { email: email.toLowerCase(), roleId, inviteId: invite.inviteId, emailSent: !!sent.ok },
  });
  if (!sent.ok) return reply(502, "The invitation is saved and holds a seat, but the email couldn't be sent. Withdraw it and try again.");
  return ok({ inviteId: invite.inviteId, emailed: email.toLowerCase() });
});
