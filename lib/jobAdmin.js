// Admin-side job lifecycle. Mirrors lib/jobClient.js but runs without a
// signed-in user, which is what makes unattended scheduling possible. Uses the
// same executor, so a scheduled run and a clicked run do identical work.

import { FieldValue } from "firebase-admin/firestore";
import { executeJob } from "./jobRunner";
import { JOB_STATUS, JOB_META } from "./jobTypes";

const LEASE_MS = 5 * 60 * 1000;

function siteRef(db, uid, siteId) {
  return db.collection("users").doc(uid).collection("sites").doc(siteId);
}

export async function createJob(db, uid, siteId, { type, params = {}, maxAttempts = 3, trigger = "schedule" }) {
  const meta = JOB_META[type];
  const ref = siteRef(db, uid, siteId).collection("jobs").doc();
  await ref.set({
    type,
    label: meta?.label || type,
    agent: meta?.agent || "MADBOT",
    plannedSteps: meta?.steps || [],
    status: JOB_STATUS.QUEUED,
    params,
    uid,
    siteId,
    trigger,
    attempt: 1,
    maxAttempts,
    steps: [],
    result: null,
    summary: null,
    error: null,
    leaseUntil: null,
    createdAt: FieldValue.serverTimestamp(),
    startedAt: null,
    finishedAt: null,
  });
  return ref.id;
}

// Transactional claim so two overlapping cron invocations can't double-run.
async function claim(db, uid, siteId, jobId) {
  const ref = siteRef(db, uid, siteId).collection("jobs").doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    const leaseHeld = data.leaseUntil?.toMillis ? data.leaseUntil.toMillis() > Date.now() : false;
    if (data.status === JOB_STATUS.RUNNING && leaseHeld) return null;
    if (![JOB_STATUS.QUEUED, JOB_STATUS.PENDING, JOB_STATUS.RUNNING].includes(data.status)) return null;
    tx.update(ref, {
      status: JOB_STATUS.RUNNING,
      startedAt: data.startedAt || FieldValue.serverTimestamp(),
      leaseUntil: new Date(Date.now() + LEASE_MS),
    });
    return { id: snap.id, ...data };
  });
}

async function commitWrites(db, uid, siteId, writes) {
  if (!writes) return;
  const site = siteRef(db, uid, siteId);
  const batch = db.batch();

  if (writes.site) {
    const clean = Object.fromEntries(Object.entries(writes.site).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length) batch.update(site, clean);
  }
  if (Array.isArray(writes.pages)) {
    writes.pages.slice(0, 400).forEach((p) => {
      batch.set(site.collection("pages").doc(p.id), { ...p.data, updatedAt: new Date() }, { merge: true });
    });
  }
  if (Array.isArray(writes.competitors)) {
    writes.competitors.forEach((c) => {
      if (c.error) return;
      batch.update(site.collection("competitors").doc(c.id), {
        snapshot: c.snapshot,
        changes: c.changes,
        lastCheckedAt: new Date(),
      });
    });
  }
  await batch.commit();
}

export async function runJobAdmin(db, uid, siteId, jobId) {
  const claimed = await claim(db, uid, siteId, jobId);
  if (!claimed) return { skipped: true };

  const ref = siteRef(db, uid, siteId).collection("jobs").doc(jobId);
  const outcome = await executeJob({ ...claimed, id: jobId });

  if (outcome.status === JOB_STATUS.COMPLETED) {
    await ref.update({ status: JOB_STATUS.VERIFYING, steps: outcome.steps || [] });
    try {
      await commitWrites(db, uid, siteId, outcome.writes);
    } catch (err) {
      await ref.update({
        status: JOB_STATUS.FAILED,
        error: `Work succeeded but saving failed: ${String(err?.message || err).slice(0, 300)}`,
        steps: outcome.steps || [],
        finishedAt: FieldValue.serverTimestamp(),
        leaseUntil: null,
      });
      return { failed: true, error: "save failed" };
    }

    await ref.update({
      status: JOB_STATUS.COMPLETED,
      steps: outcome.steps || [],
      result: outcome.result || null,
      summary: outcome.summary || null,
      durationMs: outcome.durationMs || null,
      error: null,
      finishedAt: FieldValue.serverTimestamp(),
      leaseUntil: null,
    });

    if (outcome.activity) {
      await siteRef(db, uid, siteId)
        .collection("activity")
        .add({ ...outcome.activity, undone: false, createdAt: FieldValue.serverTimestamp() });
    }
    return { completed: true, summary: outcome.summary };
  }

  await ref.update({
    status: outcome.status,
    steps: outcome.steps || [],
    error: outcome.error || null,
    attempt: outcome.nextAttempt || claimed.attempt || 1,
    leaseUntil: null,
    finishedAt: outcome.status === JOB_STATUS.FAILED ? FieldValue.serverTimestamp() : null,
  });
  return { failed: outcome.status === JOB_STATUS.FAILED, retrying: !!outcome.retrying, error: outcome.error };
}
