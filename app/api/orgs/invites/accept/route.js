import { NextResponse } from "next/server";
import { adminAvailable, adminDb } from "../../../../../lib/firebaseAdmin";
import { fields, LIMITS, rateLimit, readJson, reply, requireUser, z } from "../../../../../lib/apiGuard";
import { acceptInvite } from "../../../../../lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "That invitation link isn't valid.");
const Body = z.object({
  idToken: fields.idToken,
  orgId: ID,
  inviteId: ID,
  token: z.string().min(16, "That invitation link isn't valid.").max(128, "That invitation link isn't valid."),
});

/**
 * Accepts an invitation as the signed-in account. The org and invitation ids
 * come from the link; neither grants anything by itself: the token must match
 * the stored hash, the invitation must be for this account's own confirmed
 * address, and it must still be pending and in date (lib/orgs.acceptInvite).
 */
export async function POST(request) {
  if (!adminAvailable()) return reply(503, "No service account configured.");
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;

  const who = await requireUser(body.data.idToken);
  if (!who.ok) return who.response;

  // Guessing tokens is the only attack on this route, so it gets a tight limit.
  const limited = await rateLimit({ scope: "orgs.acceptInvite", key: who.user.uid, rules: LIMITS.account });
  if (!limited.ok) return limited.response;

  const result = await acceptInvite(adminDb(), {
    orgId: body.data.orgId,
    inviteId: body.data.inviteId,
    token: body.data.token,
    uid: who.user.uid,
    email: who.user.email,
    emailVerified: who.user.emailVerified,
    displayName: who.user.displayName,
  });
  if (!result.ok) return reply(400, result.error);
  return NextResponse.json({ ok: true, orgName: result.orgName || null });
}
