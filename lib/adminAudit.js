// What the admin console records. Server-only.
//
//   adminAudit/{id}   every admin action: who, what, when, the target, the
//                     values before and after, IP and user agent. Append-only:
//                     the Firestore rules deny every client, and nothing on
//                     the server updates or deletes a row.
//   errorLog/{id}     server errors (apiGuard.failure), for System Health.
//                     Kept 30 days (expiresAt, swept daily by lib/expiry.js).
//   systemRuns/{id}   each scheduled job run, for System Health. 30 days.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAvailable, adminDb } from "./firebaseAdmin";

const KEEP_DAYS = 30;
const MAX_VALUE_CHARS = 8000;

/** A value small and plain enough to store: Dates and Timestamps as ISO strings, capped in size. */
export function snapshotValue(value) {
  if (value === undefined) return null;
  const plain = JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().toISOString();
      if (v && typeof v === "object" && "_seconds" in v && "_nanoseconds" in v) return new Date(v._seconds * 1000).toISOString();
      return v;
    }) ?? "null"
  );
  const text = JSON.stringify(plain);
  return text.length > MAX_VALUE_CHARS ? { truncated: true, preview: text.slice(0, MAX_VALUE_CHARS) } : plain;
}

/**
 * Records one admin action. Awaited by every admin mutation before it answers.
 * If the write fails the change has still happened, so the failure is logged
 * loudly rather than reported as the change failing.
 */
export async function recordAdminAction({ admin, request, action, targetType, targetId = null, targetLabel = null, before = null, after = null, note = null }) {
  try {
    await adminDb()
      .collection("adminAudit")
      .add({
        actorUid: admin.uid,
        actorEmail: admin.email || null,
        actorRole: admin.roleId || null,
        action,
        targetType,
        targetId,
        targetLabel,
        before: snapshotValue(before),
        after: snapshotValue(after),
        note: note || null,
        ip: admin.ip || null,
        userAgent: request?.headers?.get("user-agent")?.slice(0, 300) || null,
        at: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[adminAudit] COULD NOT RECORD", action, targetType, targetId, err?.message || err);
  }
}

/** A server error, kept for System Health. Never throws. */
export async function logServerError(where, err) {
  if (!adminAvailable()) return;
  try {
    await adminDb()
      .collection("errorLog")
      .add({
        where: String(where).slice(0, 120),
        message: String(err?.message || err).slice(0, 1000),
        stack: err?.stack ? String(err.stack).slice(0, 4000) : null,
        at: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 86_400_000),
      });
  } catch {
    // The console log already has it.
  }
}

/** One scheduled run, for System Health. Never throws. */
export async function recordSystemRun(job, { ok, startedAt, summary = null }) {
  if (!adminAvailable()) return;
  try {
    await adminDb()
      .collection("systemRuns")
      .add({
        job,
        ok: !!ok,
        startedAt: new Date(startedAt),
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        summary: snapshotValue(summary),
        expiresAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 86_400_000),
      });
  } catch {
    // Not worth failing a cron run over.
  }
}
