import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAvailable } from "../../../../lib/firebaseAdmin";
import { createJob, runJobAdmin } from "../../../../lib/jobAdmin";
import { dueWorkFor } from "../../../../lib/scheduler";
import { JOB_TYPES, JOB_FEATURE, JOB_METER } from "../../../../lib/jobTypes";
import { visibilityReadiness } from "../../../../lib/aiVisibilityClient";
import { subscriptionFor } from "../../../../lib/licenseServer";
import { activePlan, clampAutonomy, featureAccess } from "../../../../lib/entitlements";
import { record, reserve } from "../../../../lib/costControl";
import { secretMatches } from "../../../../lib/apiGuard";
import { recordSystemRun } from "../../../../lib/adminAudit";
import { sitesInsidePlan } from "../../../../lib/siteLimits";
import { featureEnabled, platformFlags } from "../../../../lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Leave headroom so an in-flight job can finish and record itself rather than
// being killed mid-write by the platform timeout.
const TIME_BUDGET_MS = 240_000;
const MAX_JOBS_PER_TICK = 3;
// Sites are read in pages of this many, up to the ceiling. The ceiling is far
// above today's numbers; reaching it is the signal to move scheduling onto a
// queue rather than a sweep.
const SCAN_PAGE = 500;
const MAX_SITES_SCANNED = 20_000;
// The longest cadence is a week, so a month overdue is already "as overdue as
// anything legitimately gets".
const MAX_OVERDUE_MS = 30 * 24 * 60 * 60 * 1000;

function authorized(request) {
  // Without a configured secret this endpoint stays shut rather than open.
  // Compared in constant time, so response timing says nothing about how much
  // of a guess was right.
  return secretMatches(request.headers.get("authorization"), process.env.CRON_SECRET);
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

  // ?dryRun=1 reports every decision and runs nothing. The scheduler is the
  // one part of this system that acts unattended against real third-party
  // websites and a real credit ledger, so being able to inspect its choices
  // without triggering them is the difference between testing it and hoping.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  const startedAt = Date.now();
  const db = adminDb();
  const ran = [];
  const skipped = [];

  // collectionGroup spans every user's sites — the whole point of the global
  // scheduler shape. Paged, because this used to read the first 200 sites and
  // stop: every site after that was never scheduled, and one account that
  // created enough site documents could push everybody else past the window.
  // Only the fields scheduling reads; the full intelligence, which is most of
  // a site document's size, is loaded for the few visibility runs that start.
  const docs = [];
  let cursor = null;
  while (docs.length < MAX_SITES_SCANNED && Date.now() - startedAt < TIME_BUDGET_MS / 4) {
    let q = db
      .collectionGroup("sites")
      .select("url", "createdAt", "paused", "autonomy", "autoVisibility", "competitorCount", "schedule", "intelligence.domain")
      .orderBy(FieldPath.documentId())
      .limit(SCAN_PAGE);
    if (cursor) q = q.startAfter(cursor);
    // eslint-disable-next-line no-await-in-loop
    const page = await q.get();
    docs.push(...page.docs);
    if (page.size < SCAN_PAGE) break;
    cursor = page.docs[page.docs.length - 1];
  }
  const snap = { size: docs.length };

  // Grouped by owner, because everything below is a per-account decision: one
  // subscription read, one site limit, one autonomy cap.
  //
  // This whole block used to be a flat sweep with no licence check and no
  // metering. Every site in the database got scheduled audits, crawls and
  // competitor scans whatever plan it was on, or whether it had one at all,
  // and none of it was debited. The interactive path has always checked both;
  // the scheduled path is the one that runs unattended, so it is the one where
  // a missing check actually costs money.
  const byOwner = new Map();
  docs.forEach((docSnap) => {
    const site = { id: docSnap.id, ...docSnap.data() };
    const uid = docSnap.ref.parent.parent?.id;
    if (!uid || !site.url) return;
    if (!byOwner.has(uid)) byOwner.set(uid, []);
    byOwner.get(uid).push(site);
  });

  const candidates = [];
  const globalFlags = await platformFlags();
  for (const [uid, sites] of byOwner) {
    // eslint-disable-next-line no-await-in-loop
    // `uid` here is the data root, which is the organisation (lib/orgs.js).
    const { unavailable, subscription, suspended, flags } = await subscriptionFor(uid);
    if (unavailable) {
      skipped.push({ site: sites[0]?.url || uid, why: "could not read the licence" });
      continue;
    }
    if (suspended) {
      skipped.push({ site: sites[0]?.url || uid, why: "organisation suspended" });
      continue;
    }
    const plan = activePlan(subscription);

    // The same rule reserve() applies to interactive work (lib/siteLimits.js):
    // the oldest maxSites are inside the plan. Creating sites past the limit is
    // only blocked in the browser, so the server decides which ones it works on.
    const covered = sitesInsidePlan(sites, plan);
    const coveredIds = new Set(covered.map((s) => s.id));
    for (const over of sites.filter((s) => !coveredIds.has(s.id))) {
      skipped.push({ site: over.url, why: `beyond the ${plan.name} limit of ${plan.maxSites}` });
    }

    for (const site of covered) {
      if (site.paused) {
        skipped.push({ site: site.url, why: "paused" });
        continue;
      }

      // The dial is written straight to Firestore by the browser and the rules
      // put no constraint on it, so a stored value above the plan's ceiling
      // must be clamped here. Without this, writing autonomy 100 from the
      // console released the weekly paid visibility run on any plan.
      const autonomy = clampAutonomy(subscription, site.autonomy ?? 62);
      const due = dueWorkFor({ ...site, autonomy });

      const licensed = [];
      for (const item of due) {
        const feature = JOB_FEATURE[item.type] || null;
        if (feature && !featureAccess(subscription, feature).allowed) {
          skipped.push({ site: site.url, why: `${item.type} is not on ${plan.name}` });
          continue;
        }
        // A feature switched off in /admin stops its scheduled runs as well.
        if (feature && !featureEnabled(globalFlags, flags, feature)) {
          skipped.push({ site: site.url, why: `${item.type} is switched off` });
          continue;
        }
        licensed.push(item);
      }
      if (licensed.length) candidates.push({ uid, site, subscription, plan, due: licensed });
    }
  }

  // Most overdue first, so a backlog drains fairly instead of starving sites
  // that happen to sort late. How overdue a site is comes from lastRunAt, which
  // the browser can write, so it is capped: backdating it to 1970 used to put a
  // site at the front of every tick.
  const urgency = (c) => Math.min(c.due[0]?.overdueBy || 0, MAX_OVERDUE_MS);
  candidates.sort((a, b) => urgency(b) - urgency(a));

  // One job per account per tick, so no account can take every slot, however
  // many sites it has or however it orders them.
  const seenOwners = new Set();
  const fair = candidates.filter((c) => {
    if (seenOwners.has(c.uid)) return false;
    seenOwners.add(c.uid);
    return true;
  });
  candidates.length = 0;
  candidates.push(...fair);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      checked: snap.size,
      owners: byOwner.size,
      dueSites: candidates.length,
      wouldRun: candidates.slice(0, MAX_JOBS_PER_TICK).map((c) => ({
        site: c.site.url,
        plan: c.plan.name,
        type: c.due[0].type,
        storedAutonomy: c.site.autonomy ?? null,
        clampedAutonomy: clampAutonomy(c.subscription, c.site.autonomy ?? 62),
        credits: JOB_METER[c.due[0].type]?.action || "free",
      })),
      queuedBehind: Math.max(0, candidates.length - MAX_JOBS_PER_TICK),
      skipped,
      elapsedMs: Date.now() - startedAt,
    });
  }

  for (const { uid, site, subscription, due } of candidates) {
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
      // The scan above read only intelligence.domain; the handler needs all of it.
      const full = await db.collection("users").doc(uid).collection("sites").doc(site.id).get();
      const intelligence = full.data()?.intelligence || null;
      // The handler derives its own questions from intelligence — no user is
      // around to approve a set on a scheduled run.
      params = {
        domain: intelligence?.domain || null,
        brandName: intelligence?.business?.name || null,
        intel: intelligence,
      };
      if (!visibilityReadiness(intelligence).ready) {
        skipped.push({ site: site.url, why: "not enough crawl data for visibility" });
        continue;
      }
    } else {
      params = { url: site.url, ...(type === JOB_TYPES.CRAWL_SITE ? { maxPages: 20 } : {}) };
    }

    // Budget before work, same order as the interactive route: identity, then
    // licence, then budget, then the expensive part.
    const meter = JOB_METER[type];
    let hold = null;
    if (meter) {
      const gate = await reserve({
        orgId: uid,
        siteId: site.id,
        subscription,
        action: meter.action,
        job: meter.job,
      });
      if (!gate.ok) {
        skipped.push({ site: site.url, why: `${type}: ${gate.reason}` });
        // Stamp the clock anyway, or an exhausted account is retried on every
        // tick forever and starves everyone else.
        await db
          .collection("users").doc(uid)
          .collection("sites").doc(site.id)
          .update({ [`schedule.${type}.lastRunAt`]: FieldValue.serverTimestamp() });
        continue;
      }
      hold = gate.hold;
    }

    try {
      const jobId = await createJob(db, uid, site.id, { type, params, trigger: "schedule" });
      const out = await runJobAdmin(db, uid, site.id, jobId);

      // Replace the estimate with the real cost. A job that failed refunds,
      // because the customer did not get the work.
      if (hold) {
        const u = out.usage || {};
        await record(hold, {
          inputTokens: u.inputTokens || 0,
          outputTokens: u.outputTokens || 0,
          webSearches: u.webSearches || 0,
          failed: !out.completed,
        });
      }

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
      if (hold) await record(hold, { failed: true });
      ran.push({ site: site.url, type, error: String(err?.message || err).slice(0, 200) });
    }
  }

  await recordSystemRun("cron.tick", {
    ok: ran.every((r) => !r.error),
    startedAt,
    summary: { checked: snap.size, due: candidates.length, ran: ran.length, failed: ran.filter((r) => r.error || r.completed === false).length },
  });

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
