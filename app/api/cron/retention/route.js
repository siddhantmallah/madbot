import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { DEFAULT_POLICY, retentionFor } from "../../../../lib/dataPolicy";
import { secretMatches } from "../../../../lib/apiGuard";
import { recordSystemRun } from "../../../../lib/adminAudit";
import { sweepExpired } from "../../../../lib/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_DELETES = 400;
const SCAN_PAGE = 1000;
const MAX_SCANNED = 100_000;
const TIME_BUDGET_MS = 45_000;

function authorized(request) {
  return secretMatches(request.headers.get("authorization"), process.env.CRON_SECRET);
}

/**
 * Deletes prospect data whose retention period has expired.
 *
 * Storage limitation isn't advisory. Holding contact data indefinitely is a
 * breach on its own, regardless of how lawfully it was collected — so this has
 * to actually run, not merely be documented. A retention date written at
 * collection time with nothing enforcing it is worse than no policy, because it
 * looks like compliance.
 *
 * Two behaviours worth being explicit about. A lead that never got a retention
 * date (collected before this existed) has one assigned from its creation date
 * rather than being deleted immediately or left forever. And a suppression —
 * someone who objected — is never deleted, because forgetting an objection
 * means contacting them again.
 */
export async function GET(request) {
  return handle(request);
}
export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: process.env.CRON_SECRET ? "Unauthorized." : "CRON_SECRET is not configured." },
      { status: 401 }
    );
  }
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 500 });
  }

  const db = adminDb();
  const now = new Date();
  const deleted = [];
  const backfilled = [];
  const kept = [];

  // collectionGroup spans every customer's leads — retention is a promise made
  // to the people in the data, not a per-account setting. Paged: this read the
  // first 2,000 leads and stopped, so once there were more than that, the rest
  // were never looked at and never deleted, whatever their retention date said.
  // Each run works through as much as its budget allows; what it deletes or
  // backfills drops out of the next run's work.
  const docs = [];
  let cursor = null;
  while (docs.length < MAX_SCANNED && Date.now() - now.getTime() < TIME_BUDGET_MS) {
    let q = db
      .collectionGroup("leads")
      .select("provenance", "status", "stage", "createdAt")
      .orderBy(FieldPath.documentId())
      .limit(SCAN_PAGE);
    if (cursor) q = q.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const page = await q.get();
    docs.push(...page.docs);
    if (page.size < SCAN_PAGE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  const snap = { size: docs.length, docs };

  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const prov = d.provenance || null;

    // An objection outlives the data. Never delete these.
    if (prov?.optOutStatus === "objected" || d.status === "suppressed") {
      kept.push({ path: doc.ref.path, why: "objection on record" });
      continue;
    }

    let until = prov?.retentionUntil ? new Date(prov.retentionUntil) : null;

    if (!until) {
      // Collected before retention existed. Assign a date from when it was
      // created rather than deleting it on the spot or leaving it forever.
      const created = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      const status = d.status === "declined" || d.stage === "rejected" ? "rejected" : "active";
      const r = retentionFor({ status, policy: DEFAULT_POLICY, from: created });
      if (ops < MAX_DELETES) {
        batch.set(doc.ref, { provenance: { ...(prov || {}), retentionUntil: r.retentionUntil, retentionNote: r.note, backfilledAt: FieldValue.serverTimestamp() } }, { merge: true });
        ops += 1;
        backfilled.push({ path: doc.ref.path, retentionUntil: r.retentionUntil });
      }
      until = r.retentionUntil ? new Date(r.retentionUntil) : null;
      if (!until || until > now) continue;
    }

    if (until <= now) {
      if (ops >= MAX_DELETES) break;
      batch.delete(doc.ref);
      ops += 1;
      deleted.push({ path: doc.ref.path, wasDue: until.toISOString() });
    }
  }

  if (ops) await batch.commit();

  // Housekeeping: rate-limit counters, the error log and these run records all
  // carry expiresAt. Firestore TTL would delete them, but TTL needs billing
  // and the project is on the free plan (lib/expiry.js). A failure here is
  // reported, not fatal: the lead retention above has already been done.
  let expired;
  try {
    expired = await sweepExpired(db, { now });
  } catch (err) {
    console.error("[cron/retention] expiry sweep", err?.message || err);
    expired = { error: String(err?.message || err).slice(0, 200) };
  }

  await recordSystemRun("cron.retention", {
    ok: !expired.error,
    startedAt: now.getTime(),
    summary: { scanned: snap.size, deleted: deleted.length, backfilled: backfilled.length, hitCap: ops >= MAX_DELETES, expired },
  });

  return NextResponse.json({
    ok: true,
    scanned: snap.size,
    deleted: deleted.length,
    backfilledRetentionDates: backfilled.length,
    keptForObjection: kept.length,
    // Reported rather than silent: if the cap was hit there is more to do and
    // the next run should be soon.
    hitCap: ops >= MAX_DELETES,
    expired,
    policy: { activeDays: DEFAULT_POLICY.retentionDays.active, rejectedDays: DEFAULT_POLICY.retentionDays.rejected },
    examples: { deleted: deleted.slice(0, 5), backfilled: backfilled.slice(0, 5) },
    ranAt: now.toISOString(),
  });
}
