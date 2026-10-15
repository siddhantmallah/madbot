// Reading the admin audit log. Server-only.
//
// The log is ordered by time only. Filtering by action, actor or target on
// top of that ordering would need a composite Firestore index per combination,
// each one a manual deploy, so filters are applied to batches read
// newest-first instead. That costs reads, not correctness, and audit volumes
// are small; MAX_SCAN bounds one request.

import { iso } from "./adminApi";

const BATCH = 200;
const MAX_SCAN = 4000;

/** The filters, from a query string. Pure. */
export function auditFilters(searchParams) {
  const text = (k) => String(searchParams.get(k) || "").trim().toLowerCase().slice(0, 200);
  const day = (k) => {
    const v = searchParams.get(k);
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const to = day("to");
  return {
    q: text("q"),
    action: text("action"),
    targetType: text("targetType"),
    from: day("from"),
    // "to" is inclusive: the whole of that day.
    to: to ? new Date(to.getTime() + 86_400_000) : null,
  };
}

/** Does one entry pass the filters? Pure. */
export function auditMatches(entry, f) {
  if (f.action && !String(entry.action || "").toLowerCase().startsWith(f.action)) return false;
  if (f.targetType && String(entry.targetType || "").toLowerCase() !== f.targetType) return false;
  if (f.q) {
    const hay = [entry.actorEmail, entry.targetLabel, entry.targetId, entry.action, entry.note].map((x) => String(x || "").toLowerCase()).join(" ");
    if (!hay.includes(f.q)) return false;
  }
  return true;
}

export function toRow(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    at: iso(d.at),
    actorUid: d.actorUid,
    actorEmail: d.actorEmail,
    actorRole: d.actorRole,
    action: d.action,
    targetType: d.targetType,
    targetId: d.targetId,
    targetLabel: d.targetLabel,
    before: d.before ?? null,
    after: d.after ?? null,
    note: d.note ?? null,
    ip: d.ip ?? null,
  };
}

/**
 * Up to `limit` matching entries, newest first, resuming after `cursorId`.
 * Returns { rows, next } where next is the id of the last entry scanned, or
 * null at the end of the log.
 */
export async function readAudit(db, filters, { limit, cursorId }) {
  let base = db.collection("adminAudit").orderBy("at", "desc");
  if (filters.from) base = base.where("at", ">=", filters.from);
  if (filters.to) base = base.where("at", "<", filters.to);

  let after = null;
  if (cursorId && /^[A-Za-z0-9_-]{1,128}$/.test(cursorId)) {
    const snap = await db.collection("adminAudit").doc(cursorId).get();
    if (snap.exists) after = snap;
  }

  const rows = [];
  let scanned = 0;
  let last = null;
  let exhausted = false;
  while (rows.length < limit && scanned < MAX_SCAN) {
    let q = base.limit(BATCH);
    if (after) q = q.startAfter(after);
    // eslint-disable-next-line no-await-in-loop
    const snap = await q.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }
    for (const doc of snap.docs) {
      scanned += 1;
      last = doc;
      if (auditMatches(doc.data(), filters)) rows.push(toRow(doc));
      if (rows.length >= limit) break;
    }
    after = last;
    if (snap.size < BATCH && rows.length < limit) {
      exhausted = true;
      break;
    }
  }
  return { rows, next: exhausted || !last ? null : last.id, scanned };
}

/** One CSV cell. Quotes everything, and defuses formula injection for spreadsheets. */
export function csvCell(value) {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const CSV_COLUMNS = ["at", "actorEmail", "actorUid", "actorRole", "action", "targetType", "targetId", "targetLabel", "before", "after", "note", "ip"];
