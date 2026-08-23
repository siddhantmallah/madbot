import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAvailable } from "../../../../lib/firebaseAdmin";
import { createJob, runJobAdmin } from "../../../../lib/jobAdmin";
import { dueWorkFor } from "../../../../lib/scheduler";
import { JOB_TYPES } from "../../../../lib/jobTypes";
import { visibilityReadiness } from "../../../../lib/aiVisibilityClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Leave headroom so an in-flight job can finish and record itself rather than
// being killed mid-write by the platform timeout.
const TIME_BUDGET_MS = 240_000;
const MAX_JOBS_PER_TICK = 3;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  // Without a configured secret this endpoint stays shut rather than open.
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export async function POST(request) {
  return handle(request);
}

// Vercel Cron issues GET.
export async function GET(request) {
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

  const startedAt = Date.now();
  const db = adminDb();
  const ran = [];
  const skipped = [];

  // collectionGroup spans every user's sites — the whole point of the global
  // scheduler shape.
  const snap = await db.collectionGroup("sites").limit(200).get();

  const candidates = [];
  snap.forEach((docSnap) => {
    const site = { id: docSnap.id, ...docSnap.data() };
    const uid = docSnap.ref.parent.parent?.id;
    if (!uid || !site.url) return;
    if (site.paused) {
      skipped.push({ site: site.url, why: "paused" });
      return;
    }
    const due = dueWorkFor(site);
    if (due.length) candidates.push({ uid, site, due });
  });

  // Most overdue first, so a backlog drains fairly instead of starving sites
  // that happen to sort late.
  candidates.sort((a, b) => (b.due[0]?.overdueBy || 0) - (a.due[0]?.overdueBy || 0));

  for (const { uid, site, due } of candidates) {
    if (ran.length >= MAX_JOBS_PER_TICK) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const { type } = due[0];
    let params;
    if (type === JOB_TYPES.COMPETITOR_SCAN) {
      params = await loadCompetitors(db, uid, site.id);
      if (!params.competitors?.length) {
        skipped.push({ site: site.url, why: "no competitors" });
        continue;
      }
    } else if (type === JOB_TYPES.AI_VISIBILITY) {
      // The handler derives its own questions from intelligence — no user is
      // around to approve a set on a scheduled run.
      params = {
        domain: site.intelligence?.domain || null,
        brandName: site.intelligence?.business?.name || null,
        intel: site.intelligence || null,
      };
      if (!visibilityReadiness(site.intelligence).ready) {
        skipped.push({ site: site.url, why: "not enough crawl data for visibility" });
        continue;
      }
    } else {
      params = { url: site.url, ...(type === JOB_TYPES.CRAWL_SITE ? { maxPages: 20 } : {}) };
    }

    try {
      const jobId = await createJob(db, uid, site.id, { type, params, trigger: "schedule" });
      const out = await runJobAdmin(db, uid, site.id, jobId);

      // Stamp the cadence clock even on failure, so one broken site can't
      // monopolise every tick from here on.
      await db
        .collection("users").doc(uid)
        .collection("sites").doc(site.id)
        .update({ [`schedule.${type}.lastRunAt`]: FieldValue.serverTimestamp() });

      ran.push({
        site: site.url,
        type,
        jobId,
        completed: !!out.completed,
        summary: out.summary || out.error || null,
      });
    } catch (err) {
      ran.push({ site: site.url, type, error: String(err?.message || err).slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: snap.size,
    dueSites: candidates.length,
    ran,
    skipped: skipped.slice(0, 10),
    elapsedMs: Date.now() - startedAt,
  });
}

async function loadCompetitors(db, uid, siteId) {
  const snap = await db
    .collection("users").doc(uid)
    .collection("sites").doc(siteId)
    .collection("competitors").limit(20).get();
  return {
    competitors: snap.docs.map((d) => ({ id: d.id, url: d.data().url, snapshot: d.data().snapshot || null })),
  };
}
