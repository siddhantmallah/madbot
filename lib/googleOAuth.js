// A lasting Google connection for Search Console, held on the server.
// Server-only.
//
// The first version asked Google for a one-hour access token in the browser
// and kept it in page memory: a refresh lost it, and every site needed its own
// reconnect. This is Google's web-server flow instead
// (developers.google.com/identity/protocols/oauth2/web-server): the person
// approves once, Google returns a code to our callback, and the server swaps it
// for a refresh token (access_type=offline, prompt=consent, which is what makes
// Google return one). The refresh token is stored encrypted under the
// organisation, readable by no client (orgs/{orgId}/integrations is closed by
// the catch-all rule), and each request mints a short-lived access token from
// it. Each site remembers its own property (site.gscProperty).

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { decryptSecret, encryptSecret } from "./adminAuth";
import { SITE_URL } from "./company";

/** Where Google sends people back to: the site itself, or localhost in development. */
export function originFor(request) {
  if (process.env.NODE_ENV !== "production") {
    const host = request.headers.get("host") || "localhost:3000";
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  }
  return SITE_URL;
}

// The project's OAuth web client: the same one Firebase's Google sign-in uses.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "340416135340-hrcaa9q3eebr56pd8n4akhveitlqp4ir.apps.googleusercontent.com";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const STATE_TTL_MS = 10 * 60 * 1000;

export function oauthConfigured() {
  return !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.ADMIN_SECRET_KEY && process.env.ADMIN_SECRET_KEY.length >= 32;
}

function stateKey() {
  return createHash("sha256").update(`gsc-oauth-state:${process.env.ADMIN_SECRET_KEY || ""}`).digest();
}

/**
 * The state Google hands back to the callback: who started the connection,
 * for which organisation and site, until when, signed so it can't be forged
 * or replayed after it expires.
 */
export function signState({ orgId, uid, siteId }) {
  const body = Buffer.from(JSON.stringify({ orgId, uid, siteId, exp: Date.now() + STATE_TTL_MS, n: randomBytes(8).toString("hex") })).toString("base64url");
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state, now = Date.now()) {
  const [body, mac] = String(state || "").split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return s.exp > now && s.orgId && s.uid ? s : null;
  } catch {
    return null;
  }
}

export function redirectUri(origin) {
  return `${origin}/api/search-console/callback`;
}

/** Where to send the person to approve read-only Search Console access. */
export function authUrl({ origin, state }) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    // Without it, Google returns a refresh token only the first time a
    // Google account approves this client, and a reconnect would get none.
    prompt: "consent select_account",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET || "", ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Google answered ${res.status}.`);
    err.code = data.error || null;
    throw err;
  }
  return data;
}

export async function exchangeCode({ code, origin }) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
}

function integrationRef(orgId) {
  return adminDb().collection("orgs").doc(orgId).collection("integrations").doc("searchConsole");
}

export async function saveConnection({ orgId, uid, tokens }) {
  if (!tokens.refresh_token) {
    const err = new Error("Google didn't return a lasting connection. Try connecting again.");
    err.code = "no_refresh_token";
    throw err;
  }
  if (!String(tokens.scope || "").includes(GSC_SCOPE)) {
    const err = new Error("Search Console access wasn't granted. Connect again and leave its box ticked.");
    err.code = "scope_missing";
    throw err;
  }
  await integrationRef(orgId).set({
    refreshToken: encryptSecret(tokens.refresh_token),
    scope: tokens.scope,
    connectedBy: uid,
    connectedAt: FieldValue.serverTimestamp(),
  });
  tokenCache.delete(orgId);
}

// Access tokens last an hour; keep one per organisation per server instance
// rather than minting one per request.
const tokenCache = new Map();

/** An access token for the organisation, or null when it isn't connected. */
export async function accessTokenFor(orgId) {
  const cached = tokenCache.get(orgId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const snap = await integrationRef(orgId).get();
  if (!snap.exists) return null;
  const refreshToken = decryptSecret(snap.data().refreshToken);
  try {
    const data = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    tokenCache.set(orgId, { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 });
    return data.access_token;
  } catch (err) {
    // Revoked by the person in their Google account, or expired: the stored
    // connection is dead, so say "not connected" rather than failing forever.
    if (err.code === "invalid_grant") {
      await integrationRef(orgId).delete().catch(() => {});
      tokenCache.delete(orgId);
      return null;
    }
    throw err;
  }
}

export async function connectionStatus(orgId) {
  const snap = await integrationRef(orgId).get();
  return snap.exists ? { connected: true, connectedAt: snap.data().connectedAt?.toDate?.().toISOString() || null } : { connected: false };
}

/** Disconnects: revokes the grant at Google, then forgets it here. */
export async function disconnect(orgId) {
  const snap = await integrationRef(orgId).get();
  if (snap.exists) {
    const token = decryptSecret(snap.data().refreshToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => {});
    await integrationRef(orgId).delete();
  }
  tokenCache.delete(orgId);
}
