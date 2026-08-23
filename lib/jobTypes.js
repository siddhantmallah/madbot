// Client-safe job vocabulary. No server imports here — the dashboard reads
// these to render job state, and the worker imports the same constants so the
// two can't drift.

export const JOB_STATUS = {
  PENDING: "pending",
  QUEUED: "queued",
  RUNNING: "running",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  FAILED: "failed",
  WAITING_APPROVAL: "waiting_approval",
};

export const TERMINAL = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED];

export const JOB_TYPES = {
  CRAWL_SITE: "crawl_site",
  AUDIT_SITE: "audit_site",
  COMPETITOR_SCAN: "competitor_scan",
  AI_VISIBILITY: "ai_visibility",
};

export const JOB_META = {
  [JOB_TYPES.CRAWL_SITE]: {
    label: "Crawl & understand site",
    agent: "Discovery Agent",
    steps: ["fetch robots & sitemap", "crawl pages", "build site intelligence", "store"],
  },
  [JOB_TYPES.AUDIT_SITE]: {
    label: "Audit site",
    agent: "Technical Agent",
    steps: ["fetch homepage", "run checks", "score", "store findings"],
  },
  [JOB_TYPES.COMPETITOR_SCAN]: {
    label: "Scan competitors",
    agent: "Competitor Agent",
    steps: ["snapshot each competitor", "diff against last", "record changes"],
  },
  [JOB_TYPES.AI_VISIBILITY]: {
    label: "Check AI visibility",
    agent: "AI Visibility Agent",
    steps: ["build buying questions", "ask each engine", "analyse answers", "store results"],
  },
};

export function statusStyle(status) {
  switch (status) {
    case JOB_STATUS.COMPLETED:
      return { label: "Completed", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" };
    case JOB_STATUS.RUNNING:
    case JOB_STATUS.VERIFYING:
      return { label: status === "running" ? "Running" : "Verifying", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case JOB_STATUS.FAILED:
      return { label: "Failed", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" };
    case JOB_STATUS.WAITING_APPROVAL:
      return { label: "Waiting on you", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    default:
      return { label: "Queued", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
  }
}
