// What every API route does before its own work. Server-only.
//
//   readJson()      size cap, then JSON, then a zod schema; nothing a route
//                   reads from a body has skipped the schema
//   requireUser()   who is calling, from a verified ID token
//   rateLimit()     how often they may, counted in Firestore so it holds across
//                   serverless instances rather than per instance
//   secretMatches() constant-time comparison for shared secrets
//   failure()       a logged error and a response that doesn't leak it
//
// Routes return { ok: false, error } with a status on failure, the shape the
// dashboard already reads.

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminAvailable, adminDb } from "./firebaseAdmin";
import { SITE_ID } from "./siteLimits";
import { logServerError } from "./adminAudit";

export { z };

export function reply(status, error, extra = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/** Building blocks shared by the route schemas. */
export const fields = {
  idToken: z.string({ error: "Not signed in." }).min(20, "Not signed in.").max(8192, "Not signed in."),
  siteId: z.string({ error: "No site given." }).regex(SITE_ID, "No valid site was given."),
  /** Free text with a ceiling. Everything a person or a page wrote has one. */
  text: (max, label = "This field") => z.string().max(max, `${label} is too long (${max.toLocaleString()} characters at most).`),
  url: z.string().max(2048, "That address is too long."),
  domain: z.string().max(253, "That domain is too long."),
};

/**
 * The site context the dashboard sends with every writing request. All of it
 * ends up in a prompt, so every string and list has a ceiling well above what
 * the dashboard sends and well below what would blow the cost estimate.
 */
export const siteContext = z
  .object({
    name: fields.text(200, "The site name").nullish(),
    domain: fields.domain.nullish(),
    description: fields.text(2000, "The description").nullish(),
    summary: fields.text(2000, "The summary").nullish(),
    audience: fields.text(500, "The audience").nullish(),
    differentiator: fields.text(500, "The differentiator").nullish(),
    voice: fields.text(20).nullish(),
    rules: z
      .array(z.union([fields.text(500, "A rule"), z.object({ id: fields.text(64).optional(), text: fields.text(500, "A rule") })]))
      .max(40, "At most 40 rules.")
      .nullish(),
    pages: z
      .array(z.object({ path: fields.text(500).nullish(), title: fields.text(300).nullish(), words: z.number().nullish() }))
      .max(40)
      .nullish(),
  })
  .nullish();

function describe(error) {
  const issue = error.issues?.[0];
  if (!issue) return "Invalid request.";
  // Messages written for a person are used as they are. zod's own defaults
  // are prefixed with where the problem is, which is the most a caller can
  // act on.
  const path = issue.path?.length ? issue.path.join(".") : "";
  const custom = issue.message && !/^(Invalid|Too (big|small)|Expected|Unrecognized)/i.test(issue.message);
  if (custom) return issue.message;
  return path ? `Invalid request: ${path} — ${issue.message}` : `Invalid request: ${issue.message}`;
}

/**
 * Reads and validates a JSON body. Returns { ok: true, data } or
 * { ok: false, response } with a 400 or 413 ready to return.
 *
 * Unknown keys are dropped by the schemas (zod's default), so a route can't
 * be handed a field it then trusts by accident.
 */
export async function readJson(request, schema, { maxBytes = 64 * 1024 } = {}) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, response: reply(413, "That request is too large.") };
  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: reply(400, "Invalid request.") };
  }
  if (text.length > maxBytes) return { ok: false, response: reply(413, "That request is too large.") };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: reply(400, "Invalid request.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: reply(400, describe(parsed.error)) };
  return { ok: true, data: parsed.data };
}

/** The same, for query strings. */
export function readQuery(request, schema) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) return { ok: false, response: reply(400, describe(parsed.error)) };
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Verifies a Firebase ID token. Returns
 * { uid, email, emailVerified, authTime } or null.
 *
 * With a service account this is the Admin SDK's own check with revocation
 * on: a token issued before a password change, a forced sign-out or an
 * account being disabled stops working at once rather than at its natural
 * expiry an hour later. Without one it falls back to Google's lookup
 * endpoint, which still rejects forged and expired tokens.
 */
export async function verifyIdentity(idToken) {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 8192) return null;
  if (adminAvailable()) {
    try {
      const d = await adminAuth().verifyIdToken(idToken, true);
      return {
        uid: d.uid,
        email: d.email || null,
        displayName: d.name || null,
        emailVerified: d.email_verified === true,
        authTime: typeof d.auth_time === "number" ? d.auth_time : null,
      };
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const u = (await res.json())?.users?.[0];
    if (!u?.localId || u.disabled) return null;
    return { uid: u.localId, email: u.email || null, displayName: u.displayName || null, emailVerified: u.emailVerified === true, authTime: null };
  } catch {
    return null;
  }
}

/**
 * Whether a verified identity may do what was asked. Pure, so the rules are
 * testable without a token: returns null to allow, or { status, error, code }.
 */
export function identityVerdict(who, { verifiedEmail = false, recentSeconds = null } = {}, nowSec = Date.now() / 1000) {
  if (!who) return { status: 401, error: "Could not verify your account. Sign in again.", code: "unauthenticated" };
  if (verifiedEmail && !who.emailVerified) {
    return { status: 403, error: "Confirm your email address first.", code: "email_unverified" };
  }
  if (recentSeconds) {
    // No auth_time means we can't tell when they signed in, which for an
    // irreversible action is the same as "too long ago".
    const age = who.authTime ? nowSec - who.authTime : Infinity;
    if (age > recentSeconds) {
      return { status: 403, error: "For your security, sign in again to do this.", code: "reauth_required" };
    }
  }
  return null;
}

/**
 * The caller, or a ready 401/403. `recentSeconds` demands a sign-in within
 * that window, for things that can't be undone.
 */
export async function requireUser(idToken, options = {}) {
  const who = await verifyIdentity(idToken);
  const refused = identityVerdict(who, options);
  if (refused) return { ok: false, response: reply(refused.status, refused.error, { code: refused.code }) };
  return { ok: true, user: who };
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/** The caller's address as Vercel reports it. Vercel overwrites these headers, so they can't be spoofed through it. */
export function clientIp(request) {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// Used only when there is no service account, i.e. local development without
// one. Per instance, which is what the Firestore counter exists to fix.
const memory = new Map();

function memoryHit(id, limit, windowEnds) {
  const now = Date.now();
  if (memory.size > 5000) for (const [k, v] of memory) if (v.until <= now) memory.delete(k);
  const entry = memory.get(id);
  if (!entry || entry.until <= now) {
    memory.set(id, { count: 1, until: windowEnds });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/**
 * Fixed-window counter. `rules` is one or more { limit, windowSec }, all of
 * which must pass (a burst limit and a daily one, say). Returns { ok: true }
 * or { ok: false, response } with a 429 and Retry-After.
 *
 * The key is hashed, so the collection holds no addresses or uids in the
 * clear. Each row carries `expiresAt`, and the daily retention cron deletes
 * it after that (lib/expiry.js). If Firestore itself fails the request is let through and
 * the failure logged: a rate limiter that takes the product down when the
 * database hiccups is worse than one that briefly doesn't count.
 */
export async function rateLimit({ scope, key, rules, message = "Too many requests. Try again shortly." }) {
  const list = Array.isArray(rules) ? rules : [rules];
  const nowSec = Math.floor(Date.now() / 1000);
  for (const { limit, windowSec } of list) {
    const window = Math.floor(nowSec / windowSec);
    const windowEnds = (window + 1) * windowSec;
    const id = createHash("sha256").update(`${scope}|${key}|${windowSec}|${window}`).digest("hex").slice(0, 40);
    let allowed = true;
    if (!adminAvailable()) {
      allowed = memoryHit(id, limit, windowEnds * 1000);
    } else {
      try {
        const db = adminDb();
        const ref = db.collection("rateLimits").doc(id);
        allowed = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const count = snap.exists ? snap.data().count || 0 : 0;
          if (count >= limit) return false;
          tx.set(
            ref,
            {
              scope,
              count: FieldValue.increment(1),
              expiresAt: Timestamp.fromMillis((windowEnds + 3600) * 1000),
            },
            { merge: true }
          );
          return true;
        });
      } catch (err) {
        console.error(`[rateLimit:${scope}]`, err?.message || err);
        allowed = true;
      }
    }
    if (!allowed) {
      const retryAfter = Math.max(1, windowEnds - nowSec);
      const res = reply(429, message, { retryAfter });
      res.headers.set("Retry-After", String(retryAfter));
      return { ok: false, response: res };
    }
  }
  return { ok: true };
}

/** Named limits, so the same kind of endpoint is limited the same way everywhere. */
export const LIMITS = {
  // Calls that spend model time. Credits are the real bound; this stops a
  // loop hammering the model provider between credit checks.
  ai: [
    { limit: 20, windowSec: 600 },
    { limit: 200, windowSec: 86_400 },
  ],
  // Outbound mail to the caller's own address.
  email: [
    { limit: 3, windowSec: 600 },
    { limit: 10, windowSec: 86_400 },
  ],
  // Public, unauthenticated endpoints that fetch a URL the caller chose.
  publicFetch: [
    { limit: 12, windowSec: 60 },
    { limit: 150, windowSec: 86_400 },
  ],
  // Signed-in endpoints that fetch a URL.
  fetch: [{ limit: 60, windowSec: 600 }],
  // Account-level actions people take rarely.
  account: [{ limit: 10, windowSec: 3600 }],
};

// ---------------------------------------------------------------------------
// Secrets and errors
// ---------------------------------------------------------------------------

/**
 * Does `header` equal `Bearer <secret>`? Constant-time, and false whenever
 * the secret is unset, so an unconfigured endpoint refuses everyone.
 */
export function secretMatches(header, secret) {
  if (!secret) return false;
  const a = createHash("sha256").update(String(header || "")).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

/**
 * Logs what went wrong and answers with something that doesn't repeat it. A
 * provider's raw error can carry request ids, internal hostnames or the shape
 * of a query; the person on the other end needs to know it failed and
 * whether to retry, and the logs keep the rest.
 */
export function failure(where, err, message = "Something went wrong on our side. Try again in a minute.", status = 500) {
  console.error(`[${where}]`, err?.stack || err?.message || err);
  // Kept for System Health in /admin as well. Not awaited: the person waiting
  // on this response shouldn't wait on the error log too.
  logServerError(where, err);
  return reply(status, message);
}
