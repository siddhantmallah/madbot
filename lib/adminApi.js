// Shared plumbing for /api/admin routes. Server-only.

import { NextResponse } from "next/server";
import { requireAdmin } from "./adminAuth";
import { failure, reply } from "./apiGuard";

/**
 * Wraps an admin route: the console guard with the given platform permission
 * first, then the handler, then a logged, generic answer if it throws.
 *
 *   export const GET = adminRoute("platform.users.read", async ({ request, admin, params }) => …)
 */
export function adminRoute(permission, handler) {
  return async (request, ctx) => {
    const auth = await requireAdmin(request, permission);
    if (!auth.ok) return auth.response;
    try {
      return await handler({ request, admin: auth.admin, params: ctx?.params ? await ctx.params : {} });
    } catch (err) {
      return failure(`admin:${permission || "any"}`, err);
    }
  };
}

export { reply };

export function ok(body = {}) {
  return NextResponse.json({ ok: true, ...body });
}

// ---------------------------------------------------------------------------
// Pagination
//
// Server-side and cursor-based: Firestore pages by "start after this
// document", which stays correct when rows are added between pages, unlike
// an offset. The cursor is opaque to the browser.
// ---------------------------------------------------------------------------

export function pageSize(searchParams, fallback = 25) {
  const n = Number(searchParams.get("limit") || fallback);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), 100) : fallback;
}

export function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

export function decodeCursor(raw) {
  if (!raw || raw.length > 2000) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Runs a query one page at a time. `order` is the list of fields the query is
 * ordered by (the document id is always last, so ties can't skip rows);
 * `toCursorValues` turns the last document into the values to resume after.
 */
export async function pageOf(query, { limit, cursor, toCursorValues }) {
  let q = query;
  const after = decodeCursor(cursor);
  if (after) q = q.startAfter(...after);
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const next = snap.docs.length > limit && docs.length ? encodeCursor(toCursorValues(docs[docs.length - 1])) : null;
  return { docs, next };
}

/**
 * The same, resuming after a document rather than after values: right for a
 * list ordered by a timestamp, which doesn't survive a round trip through
 * JSON. The cursor is the last document's id in `collection`.
 */
export async function pageAfterDoc(query, collection, { limit, cursor }) {
  let q = query;
  if (cursor && /^[A-Za-z0-9_-]{1,128}$/.test(cursor)) {
    const snap = await collection.doc(cursor).get();
    if (snap.exists) q = q.startAfter(snap);
  }
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  return { docs, next: snap.docs.length > limit && docs.length ? docs[docs.length - 1].id : null };
}

/** Firestore Timestamps and Dates as ISO strings, for JSON. */
export function iso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
