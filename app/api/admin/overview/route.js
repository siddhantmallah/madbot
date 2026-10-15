import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok } from "../../../../lib/adminApi";
import { ACTIVE_STATUSES } from "../../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 30;

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The console's front page. Every number is counted from the database at the
 * moment it is asked for; nothing is cached, estimated or filled in.
 */
export const GET = adminRoute("platform.dashboard.read", async () => {
  const db = adminDb();
  const since = new Date(Date.now() - DAYS * 86_400_000);

  const [users, orgs, activeLicences, signups, errors, runs, orgIds] = await Promise.all([
    db.collection("users").where("email", "!=", null).count().get(),
    db.collection("orgs").where("status", "in", ["active", "suspended"]).count().get(),
    db.collection("orgs").where("subscription.status", "in", ACTIVE_STATUSES).count().get(),
    db.collection("users").where("createdAt", ">=", since).select("createdAt").get(),
    db.collection("errorLog").orderBy("at", "desc").limit(8).get(),
    db.collection("systemRuns").orderBy("finishedAt", "desc").limit(6).get(),
    db.collection("orgs").select().limit(2000).get(),
  ]);

  // Signups per day, every day in the window present (zeros included), so a
  // quiet day shows as a gap rather than disappearing from the chart.
  const byDay = new Map();
  for (let i = DAYS - 1; i >= 0; i -= 1) byDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
  signups.docs.forEach((d) => {
    const day = iso(d.data().createdAt)?.slice(0, 10);
    if (day && byDay.has(day)) byDay.set(day, byDay.get(day) + 1);
  });

  // This month's usage across every organisation, from each organisation's
  // own ledger (lib/costControl.js).
  const month = monthKey();
  const ledgers = orgIds.docs.length
    ? await db.getAll(...orgIds.docs.map((o) => db.collection("users").doc(o.id).collection("usage").doc(month)))
    : [];
  const usage = ledgers.reduce(
    (acc, s) => {
      const d = s.exists ? s.data() : {};
      acc.credits += d.credits || 0;
      acc.contentPieces += d.contentPieces || 0;
      acc.socialPosts += d.socialPosts || 0;
      acc.leadCredits += d.leadCredits || 0;
      acc.costUsd += d.costUsd || 0;
      if (s.exists && (d.credits || 0) > 0) acc.activeOrgs += 1;
      return acc;
    },
    { credits: 0, contentPieces: 0, socialPosts: 0, leadCredits: 0, costUsd: 0, activeOrgs: 0 }
  );

  return ok({
    counts: {
      users: users.data().count,
      orgs: orgs.data().count,
      activeLicences: activeLicences.data().count,
      signupsLast30Days: signups.size,
    },
    signups: [...byDay].map(([day, count]) => ({ day, count })),
    usage: { month, ...usage, costUsd: Math.round(usage.costUsd * 100) / 100, orgsCounted: orgIds.size },
    recentErrors: errors.docs.map((d) => ({ id: d.id, where: d.data().where, message: d.data().message, at: iso(d.data().at) })),
    recentRuns: runs.docs.map((d) => ({ id: d.id, job: d.data().job, ok: d.data().ok, at: iso(d.data().finishedAt), durationMs: d.data().durationMs, summary: d.data().summary })),
  });
});
