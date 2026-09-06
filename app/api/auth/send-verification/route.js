import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { buildVerifyEmail, sendEmail, usingSandboxSender } from "../../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Long enough to stop someone using the endpoint as a way to mail-bomb an
// address they do not own, short enough that a person who genuinely did not
// get the first one is not stuck.
const COOLDOWN_SECONDS = 60;

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
 * this cannot be pointed at somebody else's inbox.
 */
export async function POST(request) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const uid = await verifiedUid(body?.idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const auth = adminAuth();
  let account;
  try {
    account = await auth.getUser(uid);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read your account." }, { status: 401 });
  }

  if (!account.email) {
    return NextResponse.json({ ok: false, error: "This account has no email address." }, { status: 400 });
  }
  if (account.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const userRef = adminDb().collection("users").doc(uid);
  const snap = await userRef.get();
  const last = snap.exists ? snap.data()?.verificationEmail?.at : null;
  const lastMs = last?.toMillis ? last.toMillis() : last ? Date.parse(last) : 0;
  const waited = (Date.now() - lastMs) / 1000;
  if (lastMs && waited < COOLDOWN_SECONDS) {
    return NextResponse.json(
      {
        ok: false,
        error: `Another email was just sent. Try again in ${Math.ceil(COOLDOWN_SECONDS - waited)} seconds.`,
        retryAfter: Math.ceil(COOLDOWN_SECONDS - waited),
      },
      { status: 429 }
    );
  }

  // Where Firebase sends them once the link is used. Must be an authorised
  // domain in Firebase console, or generating the link fails.
  //
  // The order matters. VERCEL_URL is the per-deployment hostname, something
  // like madbot-a1b2c3.vercel.app, not the custom domain — using it would send
  // people to a host that almost certainly is not in Firebase's authorised
  // domains, so the link would break. The forwarded host is the domain the
  // request actually arrived on, which is the one to trust.
  const h = request.headers;
  const forwardedHost = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (forwardedHost?.startsWith("localhost") ? "http" : "https");
  const origin =
    h.get("origin") ||
    (forwardedHost ? `${proto}://${forwardedHost}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let link;
  try {
    link = await auth.generateEmailVerificationLink(account.email, {
      url: `${origin}/dashboard?verified=1`,
      handleCodeInApp: false,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not create a verification link: ${String(err?.message || err)}` },
      { status: 500 }
    );
  }

  const { subject, html, text } = buildVerifyEmail({ name: account.displayName, link });
  const result = await sendEmail({ to: account.email, subject, html, text });

  await userRef.set(
    {
      verificationEmail: {
        ok: !!result.ok,
        error: result.error || null,
        sandboxSender: usingSandboxSender(),
        at: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "The email could not be sent." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    to: account.email,
    // The single most common reason a verification email never arrives.
    sandboxSender: usingSandboxSender(),
  });
}
