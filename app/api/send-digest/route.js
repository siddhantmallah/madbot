import { NextResponse } from "next/server";
import { sendEmail, usingSandboxSender } from "../../../lib/email";
import { buildDigest } from "../../../lib/digest";
import { adminAuth, adminAvailable, adminDb } from "../../../lib/firebaseAdmin";
import { fields, LIMITS, rateLimit, readJson, reply, z } from "../../../lib/apiGuard";
import { authorize } from "../../../lib/licenseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Search Console figures are the one part of a digest the server can't read
// for itself: they come from the customer's own Google session in the
// browser. They arrive as numbers and nothing else, so they can't carry markup.
const Period = z.object({
  clicks: z.number().finite().min(0).max(1e12),
  impressions: z.number().finite().min(0).max(1e12),
  position: z.number().finite().min(0).max(1e6).nullish(),
});

const Body = z.object({
  idToken: fields.idToken,
  siteId: fields.siteId,
  search: z.object({ current: Period, previous: Period.partial().nullish() }).nullish(),
});

/**
 * Emails the signed-in customer a digest of one of their sites.
 *
 * The digest is built here, from Firestore, by the same builder the dashboard
 * uses for its preview. This route used to take `subject` and `html` from the
 * request and send them from our verified domain: anyone could sign up with
 * somebody else's address, never confirm it, and mail that person whatever
 * they liked under MADBOT's name, as often as they liked. Now the content is
 * ours, the address must be confirmed, and sending is rate limited.
 */
export async function POST(request) {
  if (!process.env.RESEND_API_KEY) {
    return reply(500, "Email sending isn't configured yet.");
  }
  if (!adminAvailable()) {
    return reply(503, "The digest can't be built without the server's service account.");
  }

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId, search } = body.data;

  // Any member who can see the site can mail its digest to themselves; the
  // address is their own confirmed one, never one from the request.
  const auth = await authorize(idToken, null, { permission: "sites.read" });
  if (!auth.ok) return reply(auth.status, auth.error, { code: auth.code });
  if (!auth.emailVerified) return reply(403, "Confirm your email address first.", { code: "email_unverified" });
  const { uid, orgId } = auth;

  const limited = await rateLimit({
    scope: "email.digest",
    key: uid,
    rules: LIMITS.email,
    message: "A digest was just sent. You can send another in a few minutes.",
  });
  if (!limited.ok) return limited.response;

  const db = adminDb();
  const siteRef = db.collection("users").doc(orgId).collection("sites").doc(siteId);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) return reply(404, "That site isn't on your account.");

  const [recent, activityCount, approvals, leads, content, competitors, account] = await Promise.all([
    siteRef.collection("activity").orderBy("createdAt", "desc").limit(5).get(),
    siteRef.collection("activity").count().get(),
    siteRef.collection("approvals").select("status", "title").limit(1000).get(),
    siteRef.collection("leads").select("stage").limit(5000).get(),
    // `words` rather than the article itself: a written piece always has a
    // word count, and the articles are the bulk of the collection's bytes.
    siteRef.collection("content").select("status", "words").limit(2000).get(),
    siteRef.collection("competitors").select("url", "changes").limit(20).get(),
    adminAuth().getUser(uid),
  ]);
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const { subject, html, text } = buildDigest({
    site: { id: siteId, ...siteSnap.data() },
    activity: rows(recent),
    activityCount: activityCount.data().count,
    approvals: rows(approvals),
    leads: rows(leads),
    content: rows(content).map((c) => ({ ...c, article: c.words ? true : null })),
    competitors: rows(competitors),
    search: search || null,
  });

  // The address on the account, never one from the request.
  const to = account.email;
  if (!to) return reply(400, "This account has no email address.");

  const result = await sendEmail({ to, subject, html, text });
  if (!result.ok) {
    console.error("[send-digest]", result.error);
    return NextResponse.json(
      {
        ok: false,
        error: "The digest couldn't be sent just now. Try again in a few minutes.",
        // The sandbox sender only delivers to the Resend account's own address,
        // which looks exactly like a broken app if it isn't called out.
        sandboxSender: usingSandboxSender(),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id, to });
}
