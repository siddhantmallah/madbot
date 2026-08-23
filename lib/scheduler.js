import { JOB_TYPES } from "./jobTypes";

// One global scheduler, not one per customer: a tick finds due work across all
// sites and processes a bounded slice. Cadences are conservative — this fetches
// other people's websites, so it should be a polite neighbour by default.
export const CADENCE = {
  [JOB_TYPES.COMPETITOR_SCAN]: { everyMs: 6 * 60 * 60 * 1000, label: "every 6 hours" },
  [JOB_TYPES.AUDIT_SITE]: { everyMs: 24 * 60 * 60 * 1000, label: "daily" },
  [JOB_TYPES.CRAWL_SITE]: { everyMs: 7 * 24 * 60 * 60 * 1000, label: "weekly" },
};

function millisOf(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * What this site is due for right now, most-overdue first. Returns [] for a
 * paused site — the pause switch has to mean something to the scheduler or it
 * doesn't mean anything at all.
 */
export function dueWorkFor(site, now = Date.now()) {
  if (!site || site.paused) return [];
  const schedule = site.schedule || {};
  const due = [];

  for (const [type, { everyMs }] of Object.entries(CADENCE)) {
    // A competitor scan with nothing to scan is not work.
    if (type === JOB_TYPES.COMPETITOR_SCAN && !(site.competitorCount > 0)) continue;

    const last = millisOf(schedule[type]?.lastRunAt);
    const overdueBy = now - (last + everyMs);
    // Never-run work is due immediately, but ordered after genuinely overdue work.
    if (last === 0 || overdueBy >= 0) {
      due.push({ type, overdueBy: last === 0 ? 0 : overdueBy, neverRun: last === 0 });
    }
  }

  return due.sort((a, b) => b.overdueBy - a.overdueBy);
}

export function nextDueAt(site, type, now = Date.now()) {
  const cadence = CADENCE[type];
  if (!cadence) return null;
  const last = millisOf(site?.schedule?.[type]?.lastRunAt);
  return last === 0 ? now : last + cadence.everyMs;
}
