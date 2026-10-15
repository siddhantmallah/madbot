import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";
import { fields, rateLimit, readJson, requireUser, z } from "../../../../lib/apiGuard";
import {
  MFA_COOKIE,
  SESSION_COOKIE,
  SESSION_HOURS,
  adminConsoleConfigured,
  clientIp,
  cookieOptions,
  decryptSecret,
  encryptSecret,
  platformRoleOf,
  requireAdmin,
  sameOrigin,
  signMfa,
} from "../../../../lib/adminAuth";
import { generateSecret, otpauthUri, verifyTotp } from "../../../../lib/totp";
import { recordAdminAction } from "../../../../lib/adminAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A Firebase session cookie can only be made from a sign-in this recent.
const RECENT_SIGN_IN_SECONDS = 300;

const Body = z.object({
  idToken: fields.idToken,
  code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/, "Enter the 6-digit code from your authenticator app.").optional(),
});

const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });

/**
 * Signing in to the console, in two calls.
 *
 *   { idToken }         who you are. Answers { step: "code" } if you have an
 *                       authenticator set up, or { step: "enroll", secret,
 *                       otpauth } the first time, with a new secret to add.
 *   { idToken, code }   the code from the app. On success, sets the session
 *                       and second-factor cookies.
 *
 * The secret is kept encrypted (ADMIN_SECRET_KEY). An enrolment isn't final
 * until a code from it has been entered, so a secret that was shown but never
 * added to an app can't lock anyone out.
 */
export async function POST(request) {
  if (!adminConsoleConfigured()) {
    return NextResponse.json({ error: "The admin console isn't configured on this server (ADMIN_SECRET_KEY)." }, { status: 503 });
  }
  if (!sameOrigin(request)) return NextResponse.json({ error: "Refused." }, { status: 403 });

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const who = await requireUser(body.data.idToken, { recentSeconds: RECENT_SIGN_IN_SECONDS });
  if (!who.ok) return who.response;
  const { uid, email } = who.user;

  const role = await platformRoleOf(uid);
  if (!role) return notFound();

  // Five wrong codes in ten minutes and the door stays shut for a while: a
  // six-digit code is a million guesses, and this keeps it that way.
  const limited = await rateLimit({
    scope: "admin.session",
    key: uid,
    rules: [{ limit: 10, windowSec: 600 }],
    message: "Too many attempts. Wait ten minutes and try again.",
  });
  if (!limited.ok) return limited.response;

  const db = adminDb();
  const ref = db.collection("platformAdmins").doc(uid);
  const snap = await ref.get();
  const row = snap.exists ? snap.data() : {};

  if (!body.data.code) {
    if (row.totpSecret) return NextResponse.json({ ok: true, step: "code" });
    const secret = generateSecret();
    await ref.set(
      {
        uid,
        email: email || null,
        // Owners come from ADMIN_UIDS; their row only carries the second factor.
        ...(role.source === "env" ? { roleId: role.roleId, source: "env", status: "active" } : {}),
        totpPending: encryptSecret(secret),
        totpPendingAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const otpauth = otpauthUri({ secret, account: email || uid });
    // The same otpauth URI as a QR code, drawn here so the browser loads no
    // QR library. Medium error correction: still scans off a dim laptop screen.
    const qrSvg = await QRCode.toString(otpauth, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
    return NextResponse.json({ ok: true, step: "enroll", secret, otpauth, qrSvg });
  }

  const enrolling = !row.totpSecret;
  const stored = row.totpSecret || row.totpPending;
  if (!stored) return NextResponse.json({ error: "Start again: there's no authenticator to check against yet." }, { status: 400 });

  let secret;
  try {
    secret = decryptSecret(stored);
  } catch {
    return NextResponse.json({ error: "The stored authenticator can't be read. Ask an owner to reset it." }, { status: 500 });
  }
  const step = verifyTotp(secret, body.data.code);
  // A code is good once. Seeing the same step twice is a replay.
  if (step === null || (typeof row.totpLastStep === "number" && step <= row.totpLastStep)) {
    return NextResponse.json({ error: "That code isn't right. Codes change every 30 seconds; try the current one." }, { status: 401 });
  }

  await ref.set(
    {
      totpLastStep: step,
      lastSignInAt: FieldValue.serverTimestamp(),
      ...(enrolling ? { totpSecret: stored, totpPending: FieldValue.delete(), totpPendingAt: FieldValue.delete(), totpEnrolledAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true }
  );

  const maxAge = SESSION_HOURS * 3600;
  const sessionCookie = await adminAuth().createSessionCookie(body.data.idToken, { expiresIn: maxAge * 1000 });
  const admin = { uid, email, roleId: role.roleId, ip: clientIp(request) };
  if (enrolling) await recordAdminAction({ admin, request, action: "admin.mfa_enrolled", targetType: "admin", targetId: uid, targetLabel: email });
  await recordAdminAction({ admin, request, action: "admin.sign_in", targetType: "admin", targetId: uid, targetLabel: email });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionCookie, cookieOptions(maxAge));
  res.cookies.set(MFA_COOKIE, signMfa(uid, Date.now() + maxAge * 1000), cookieOptions(maxAge));
  return res;
}

/** Who is signed in to the console, for the console's own header. */
export async function GET(request) {
  const auth = await requireAdmin(request, null);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, admin: { uid: auth.admin.uid, email: auth.admin.email, roleId: auth.admin.roleId, permissions: auth.admin.permissions } });
}

/** Signs out of the console. The Firebase session is revoked too, so the cookie is dead everywhere. */
export async function DELETE(request) {
  const auth = await requireAdmin(request, null);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  res.cookies.set(MFA_COOKIE, "", cookieOptions(0));
  if (auth.ok) {
    await recordAdminAction({ admin: auth.admin, request, action: "admin.sign_out", targetType: "admin", targetId: auth.admin.uid, targetLabel: auth.admin.email });
    await adminAuth().revokeRefreshTokens(auth.admin.uid).catch(() => {});
  }
  return res;
}
