"use client";

// Client half of the job engine. Creates jobs, claims them with a lease so a
// second tab can't run the same one, calls the worker, then commits the
// resulting writes under the signed-in user's own permissions.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { JOB_STATUS, JOB_META } from "./jobTypes";

function jobRef(uid, siteId, jobId) {
  return doc(db, "users", uid, "sites", siteId, "jobs", jobId);
}

export async function enqueueJob(uid, siteId, { type, params = {}, maxAttempts = 3 }) {
  const meta = JOB_META[type];
  const ref = await addDoc(collection(db, "users", uid, "sites", siteId, "jobs"), {
    type,
    label: meta?.label || type,
    agent: meta?.agent || "MADBOT",
    plannedSteps: meta?.steps || [],
    status: JOB_STATUS.QUEUED,
    params,
    uid,
    siteId,
    attempt: 1,
    maxAttempts,
    steps: [],
    result: null,
    summary: null,
    error: null,
    leaseUntil: null,
    createdAt: serverTimestamp(),
    startedAt: null,
    finishedAt: null,
  });
  return ref.id;
}

// Atomically moves a queued job to running. Returns null if someone else got
// there first or the lease is still held.
async function claim(uid, siteId, jobId) {
  const ref = jobRef(uid, siteId, jobId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    const leaseHeld = data.leaseUntil?.toMillis ? data.leaseUntil.toMillis() > Date.now() : false;
    if (data.status === JOB_STATUS.RUNNING && leaseHeld) return null;
    if (![JOB_STATUS.QUEUED, JOB_STATUS.PENDING, JOB_STATUS.RUNNING].includes(data.status)) return null;

    tx.update(ref, {
      status: JOB_STATUS.RUNNING,
      startedAt: data.startedAt || serverTimestamp(),
      leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { id: snap.id, ...data };
  });
}

async function commitWrites(uid, siteId, writes) {
  if (!writes) return;
  const batch = writeBatch(db);

  if (writes.site) {
    const clean = Object.fromEntries(Object.entries(writes.site).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length) {
      batch.update(doc(db, "users", uid, "sites", siteId), clean);
    }
  }

  if (Array.isArray(writes.pages)) {
    // Firestore batches cap at 500 ops; the crawl cap keeps us well under.
    writes.pages.slice(0, 400).forEach((p) => {
      batch.set(doc(db, "users", uid, "sites", siteId, "pages", p.id), { ...p.data, updatedAt: new Date() });
    });
  }

  if (Array.isArray(writes.leads)) {
    // Merged, not replaced: discovery writes the shortlist and qualification
    // later adds a score to the same document, so neither may clobber the other.
    writes.leads.slice(0, 400).forEach((l) => {
      batch.set(
        doc(db, "users", uid, "sites", siteId, "leads", l.id),
        { ...l.data, updatedAt: new Date() },
        { merge: true }
      );
    });
  }

  if (Array.isArray(writes.competitors)) {
    writes.competitors.forEach((c) => {
      if (c.error) return;
      batch.update(doc(db, "users", uid, "sites", siteId, "competitors", c.id), {
        snapshot: c.snapshot,
        changes: c.changes,
        lastCheckedAt: new Date(),
      });
    });
  }

  await batch.commit();
}

/**
 * Claims and runs a job end to end, persisting every state transition so the
 * Activity and Agent Runs views reflect what actually happened.
 */
export async function runJob(uid, siteId, jobId, { getIdToken, onActivity } = {}) {
  const claimed = await claim(uid, siteId, jobId);
  if (!claimed) return { skipped: true };

  const ref = jobRef(uid, siteId, jobId);
  const idToken = getIdToken ? await getIdToken() : null;

  let payload;
  try {
    const res = await fetch("/api/jobs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, job: { ...claimed, id: jobId } }),
    });
    payload = await res.json();
  } catch (err) {
    await updateDoc(ref, {
      status: JOB_STATUS.FAILED,
      error: String(err?.message || err).slice(0, 400),
      finishedAt: serverTimestamp(),
      leaseUntil: null,
    });
    return { failed: true, error: String(err?.message || err) };
  }

  const outcome = payload?.outcome;
  if (!outcome) {
    await updateDoc(ref, {
      status: JOB_STATUS.FAILED,
      error: payload?.error || "Worker returned nothing.",
      finishedAt: serverTimestamp(),
      leaseUntil: null,
    });
    return { failed: true, error: payload?.error || "Worker returned nothing." };
  }

  // Verify-then-complete, so a write failure can't be reported as success.
  if (outcome.status === JOB_STATUS.COMPLETED) {
    await updateDoc(ref, { status: JOB_STATUS.VERIFYING, steps: outcome.steps || [] });
    try {
      await commitWrites(uid, siteId, outcome.writes);
    } catch (err) {
      await updateDoc(ref, {
        status: JOB_STATUS.FAILED,
        error: `Work succeeded but saving failed: ${String(err?.message || err).slice(0, 300)}`,
        steps: outcome.steps || [],
        finishedAt: serverTimestamp(),
        leaseUntil: null,
      });
      return { failed: true, error: "Saving the result failed." };
    }

    await updateDoc(ref, {
      status: JOB_STATUS.COMPLETED,
      steps: outcome.steps || [],
      result: outcome.result || null,
      summary: outcome.summary || null,
      durationMs: outcome.durationMs || null,
      error: null,
      finishedAt: serverTimestamp(),
      leaseUntil: null,
    });

    if (outcome.activity && onActivity) await onActivity(outcome.activity);
    return { completed: true, outcome };
  }

  // Retryable failure stays queued with the attempt bumped.
  await updateDoc(ref, {
    status: outcome.status,
    steps: outcome.steps || [],
    error: outcome.error || null,
    attempt: outcome.nextAttempt || claimed.attempt || 1,
    leaseUntil: null,
    finishedAt: outcome.status === JOB_STATUS.FAILED ? serverTimestamp() : null,
  });
  return { failed: outcome.status === JOB_STATUS.FAILED, retrying: !!outcome.retrying, error: outcome.error };
}

export async function enqueueAndRun(uid, siteId, spec, opts) {
  const jobId = await enqueueJob(uid, siteId, spec);
  const out = await runJob(uid, siteId, jobId, opts);
  return { jobId, ...out };
}

export async function getJob(uid, siteId, jobId) {
  const snap = await getDoc(jobRef(uid, siteId, jobId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
