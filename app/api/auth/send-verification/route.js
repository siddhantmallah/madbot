import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { buildVerifyEmail, sendEmail, usingSandboxSender } from "../../../../lib/email";
import { SITE_URL } from "../../../../lib/company";
import { platformSettings } from "../../../../lib/platform";
import { failure, fields, LIMITS, rateLimit, readJson, reply, requireUser, z } from "../../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Long enough to stop someone using the endpoint as a way to mail-bomb an
// address they do not own, short enough that a person who genuinely did not
// get the first one is not stuck.
const COOLDOWN_SECONDS = 60;

const Body = z.object({ idToken: fields.idToken });

/**
 * Where Firebase sends people once the link is used. The production address
 * in production; the dev server's own origin only in development. This used
 * to trust the request's Origin header, which a caller sets to anything.
 */
function continueOrigin(request) {
  if (process.env.NODE_ENV !== "production") {
    const host = request.headers.get("host") || "localhost:3000";
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  }
  return SITE_URL;
}

/**
 * Sends the "confirm your email address" message.
 *
 * The link comes from the Firebase Admin SDK but the email does not: Firebase's
 * own sender is a Google address with Google's template, and this is the first
 * thing a new customer receives. It goes out through Resend on the verified
 * domain instead, which also means delivery shows up in the same event stream
 * as everything else.
 *
 * The address is read from the Firebase account, never from the request, so
 * this cannot be pointed at somebody else's inbox. What it can be pointed at
 * is the address an unconfirmed account was registered with, which is why
 * the cooldown is claimed atomically and the route is rate limited as well.
 */
export async function POST(request) {
  if (!adminAvailable()) {
    return reply(503, "No service account configured.");
  }

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;

  const who = await requireUser(body.data.idToken);
  if (!who.ok) return who.response;
  const { uid } = who.user;

  const limited = await rateLimit({
    scope: "email.verify",
    key: uid,
    rules: LIMITS.email,
    message: "Several confirmation emails have gone out already. Check your spam folder, or try again later.",
  });
  if (!limited.ok) return limited.response;

  const auth = adminAuth();
  let account;
  try {
    account = await auth.getUser(uid);
  } catch {
    return reply(401, "Could not read your account.");
  }

  if (!account.email) return reply(400, "This account has no email address.");
  if (account.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  // Claim the cooldown in the same transaction that checks it. Reading it,
  // sending, and writing it afterwards let parallel requests all read "no
  // email sent yet" and each send one.
  const userRef = adminDb().collection("users").doc(uid);
  const wait = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const last = snap.exists ? snap.data()?.verificationEmail?.at : null;
    const lastMs = last?.toMillis ? last.toMillis() : last ? Date.parse(last) : 0;
    const waited = (Date.now() - lastMs) / 1000;
    if (lastMs && waited < COOLDOWN_SECONDS) return Math.ceil(COOLDOWN_SECONDS - waited);
    tx.set(userRef, { verificationEmail: { at: FieldValue.serverTimestamp(), pending: true } }, { merge: true });
    return 0;
  });
  if (wait) {
    return reply(429, `Another email was just sent. Try again in ${wait} seconds.`, { retryAfter: wait });
  }

  let link;
  try {
    link = await auth.generateEmailVerificationLink(account.email, {
      url: `${continueOrigin(request)}/dashboard?verified=1`,
      handleCodeInApp: false,
    });
  } catch (err) {
    return failure("send-verification", err, "Could not create a verification link. Try again in a minute.");
  }

  const { emailTemplates } = await platformSettings();
  const { subject, html, text } = buildVerifyEmail({ name: account.displayName, link, template: emailTemplates?.verify });
  const result = await sendEmail({ to: account.email, subject, html, text });

  await userRef.set(
    {
      verificationEmail: {
        ok: !!result.ok,
        error: result.error || null,
        sandboxSender: usingSandboxSender(),
        pending: false,
        at: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  if (!result.ok) {
    console.error("[send-verification]", result.error);
    return reply(502, "The email could not be sent just now. Try again in a minute.");
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    to: account.email,
    // The single most common reason a verification email never arrives.
    sandboxSender: usingSandboxSender(),
  });
}
