import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, pageAfterDoc, pageSize } from "../../../../lib/adminApi";
import { adminConsoleConfigured } from "../../../../lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How long after its last run a scheduled job counts as late: its cadence in
// vercel.json, plus an hour of slack.
const JOBS = [
  { job: "cron.tick", label: "Scheduler", everyHours: 6 },
  { job: "cron.retention", label: "Retention", everyHours: 24 },
];

/**
 * System health, measured when asked: whether each dependency is configured,
 * a live round trip to Firestore, when each scheduled job last ran and how it
 * went, and the most recent server errors. Configured means the setting is
 * present; it doesn't prove the key is valid, and the page says so.
 */
export const GET = adminRoute("platform.health.read", async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const db = adminDb();

  const t0 = Date.now();
  let firestore = { ok: true, ms: null, error: null };
  try {
    await db.collection("platform").doc("settings").get();
    firestore.ms = Date.now() - t0;
  } catch (err) {
    firestore = { ok: false, ms: Date.now() - t0, error: String(err?.message || err).slice(0, 200) };
  }

  // The most recent runs of every job, newest first, then each job's latest
  // picked out. (Filtering by job in the query and ordering by time would need
  // a composite index.) Four runs a day plus one: 100 covers weeks.
  const recentRuns = (await db.collection("systemRuns").orderBy("finishedAt", "desc").limit(100).get()).docs.map((d) => d.data());
  const runs = await Promise.all(
    JOBS.map(async (j) => {
      const latest = recentRuns.find((r) => r.job === j.job);
      const lastAt = latest ? iso(latest.finishedAt) : null;
      const late = !lastAt || Date.now() - new Date(lastAt).getTime() > (j.everyHours + 1) * 3_600_000;
      return { ...j, lastAt, ok: latest ? !!latest.ok : null, durationMs: latest?.durationMs ?? null, summary: latest?.summary ?? null, late };
    })
  );

  const { docs, next } = await pageAfterDoc(db.collection("errorLog").orderBy("at", "desc"), db.collection("errorLog"), {
    limit: pageSize(searchParams, 25),
    cursor: searchParams.get("cursor"),
  });

  return ok({
    checkedAt: new Date().toISOString(),
    configured: [
      { key: "firebaseAdmin", label: "Firebase service account", ok: !!process.env.FIREBASE_SERVICE_ACCOUNT_B64 },
      { key: "adminConsole", label: "Admin console secret (ADMIN_SECRET_KEY)", ok: adminConsoleConfigured() },
      { key: "anthropic", label: "Anthropic API key", ok: !!process.env.ANTHROPIC_API_KEY, note: "Present; /api/ai-status makes a live call to check it works." },
      { key: "resend", label: "Resend (email)", ok: !!process.env.RESEND_API_KEY },
      { key: "emailFrom", label: "Sending address (EMAIL_FROM)", ok: !!process.env.EMAIL_FROM },
      { key: "cron", label: "Cron secret", ok: !!process.env.CRON_SECRET },
      { key: "webhook", label: "Resend webhook secret", ok: !!process.env.RESEND_WEBHOOK_SECRET },
      { key: "pepper", label: "Trial ledger pepper", ok: !!process.env.TRIAL_LEDGER_PEPPER },
    ],
    firestore,
    jobs: runs,
    errors: docs.map((d) => ({ id: d.id, where: d.data().where, message: d.data().message, stack: d.data().stack, at: iso(d.data().at) })),
    next,
  });
});
