// The admin console's front door. Server-only.
//
// Getting in takes three things, checked on every /admin page and every
// /api/admin call:
//
//   1. a Firebase session cookie (httpOnly, SameSite=Strict, 8 hours), made
//      from a sign-in no more than five minutes old;
//   2. a second cookie proving an authenticator code was entered for that same
//      account in that session, signed with ADMIN_SECRET_KEY (HMAC-SHA256);
//   3. a platform role: ADMIN_UIDS are owners; anyone else needs a row in
//      platformAdmins with a platform-scope role.
//
// Someone who isn't an admin gets a 404, as in Lawzer: the console doesn't
// confirm it exists. Mutations must also come from our own origin (the
// cookies are SameSite=Strict as well; this is the second lock).
//
// ADMIN_SECRET_KEY encrypts the authenticator secrets at rest (AES-256-GCM)
// and signs the second-factor cookie. Without it the console refuses
// everyone: there is no way to keep a second factor without a secret.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminAuth, adminAvailable, adminDb } from "./firebaseAdmin";
import { BUILT_IN_ROLES, OWNER_ROLE, SCOPES, has } from "./rbac";
import { getRole } from "./orgs";
import { SITE_URL } from "./company";

export const SESSION_HOURS = 8;
const PROD = process.env.NODE_ENV === "production";
// __Host- binds a cookie to this exact host, https only, path /. Plain names
// in development, where the site is http://localhost.
export const SESSION_COOKIE = PROD ? "__Host-madbot_admin" : "madbot_admin";
export const MFA_COOKIE = PROD ? "__Host-madbot_admin_2fa" : "madbot_admin_2fa";

function secretKey() {
  const raw = process.env.ADMIN_SECRET_KEY;
  if (!raw || raw.length < 32) return null;
  return createHash("sha256").update(raw).digest();
}

export function adminConsoleConfigured() {
  return adminAvailable() && !!secretKey();
}

// ---------------------------------------------------------------------------
// Secrets at rest
// ---------------------------------------------------------------------------

export function encryptSecret(plain) {
  const key = secretKey();
  if (!key) throw new Error("ADMIN_SECRET_KEY is not set.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(blob) {
  const key = secretKey();
  if (!key) throw new Error("ADMIN_SECRET_KEY is not set.");
  const [iv, tag, enc] = String(blob).split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// The second-factor cookie
// ---------------------------------------------------------------------------

/** A signed statement: this uid passed a code, valid until `exp` (ms). */
export function signMfa(uid, exp) {
  const key = secretKey();
  const body = Buffer.from(JSON.stringify({ uid, exp })).toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** The uid the cookie vouches for, or null if it is forged, expired or for someone else. */
export function verifyMfa(token, uid, now = Date.now()) {
  const key = secretKey();
  if (!key || typeof token !== "string") return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (claims.uid !== uid || !(claims.exp > now)) return null;
    return claims.uid;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds) {
  return { httpOnly: true, secure: PROD, sameSite: "strict", path: "/", maxAge: maxAgeSeconds };
}

// ---------------------------------------------------------------------------
// Who is an admin, and what may they do
// ---------------------------------------------------------------------------

export function ownerUids() {
  return String(process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The platform role for a uid: { roleId, permissions, source } or null.
 * ADMIN_UIDS are owners and can't be changed from the console; everyone else
 * comes from platformAdmins, and only while their row is active.
 */
export async function platformRoleOf(uid) {
  if (ownerUids().includes(uid)) {
    return { roleId: OWNER_ROLE.platform, permissions: BUILT_IN_ROLES.platform_owner.permissions, source: "env" };
  }
  const db = adminDb();
  const snap = await db.collection("platformAdmins").doc(uid).get();
  if (!snap.exists || snap.data().status !== "active") return null;
  const roleId = snap.data().roleId;
  // Nobody is an owner by database row: owners are set in the environment.
  if (roleId === OWNER_ROLE.platform) return null;
  const role = await getRole(db, roleId);
  if (!role || role.scope !== SCOPES.PLATFORM) return null;
  return { roleId, permissions: role.permissions || [], source: "console" };
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

function notFound() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

/** Mutations only from our own pages. */
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([SITE_URL, new URL(SITE_URL).origin.replace("://www.", "://")]);
  if (!PROD) {
    const host = request.headers.get("host");
    if (host) allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
}

export function clientIp(request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * Checks everything the console needs, from the request's cookies. Returns
 * { ok: true, admin: { uid, email, roleId, permissions, ip } } or
 * { ok: false, response }.
 *
 * `permission` is a platform permission key; pass null for "any admin".
 */
export async function requireAdmin(request, permission) {
  if (!adminConsoleConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "The admin console isn't configured on this server." }, { status: 503 }) };
  }
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) {
    return { ok: false, response: NextResponse.json({ error: "Refused: this request didn't come from the console." }, { status: 403 }) };
  }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const mfa = request.cookies.get(MFA_COOKIE)?.value;
  if (!session || !mfa) return { ok: false, response: NextResponse.json({ error: "Sign in to the console.", code: "no_session" }, { status: 401 }) };

  let decoded;
  try {
    decoded = await adminAuth().verifySessionCookie(session, true);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Your console session has ended. Sign in again.", code: "no_session" }, { status: 401 }) };
  }
  if (!verifyMfa(mfa, decoded.uid)) {
    return { ok: false, response: NextResponse.json({ error: "Enter your authenticator code again.", code: "no_mfa" }, { status: 401 }) };
  }
  const role = await platformRoleOf(decoded.uid);
  if (!role) return { ok: false, response: notFound() };
  if (permission && !has(role.permissions, permission)) {
    return { ok: false, response: NextResponse.json({ error: "Your role doesn't allow that." }, { status: 403 }) };
  }
  return {
    ok: true,
    admin: { uid: decoded.uid, email: decoded.email || null, roleId: role.roleId, permissions: role.permissions, ip: clientIp(request) },
  };
}

/**
 * The same check for a server component (the /admin layout), from a cookie
 * store rather than a request. Returns the admin or null.
 */
export async function adminFromCookies(cookieStore) {
  if (!adminConsoleConfigured()) return null;
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const mfa = cookieStore.get(MFA_COOKIE)?.value;
  if (!session || !mfa) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(session, true);
    if (!verifyMfa(mfa, decoded.uid)) return null;
    const role = await platformRoleOf(decoded.uid);
    return role ? { uid: decoded.uid, email: decoded.email || null, ...role } : null;
  } catch {
    return null;
  }
}
