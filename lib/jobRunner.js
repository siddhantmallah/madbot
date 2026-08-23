// Server-side job execution. Deliberately transport-agnostic: the same runner
// serves a user-triggered run today and a cron-triggered sweep once a service
// account exists, so autonomy is a scheduling change rather than a rewrite.

import { crawlSite } from "./crawler";
import { buildIntelligence } from "./intelligence";
import { runAudit, runSnapshot } from "./audit";
import { diffSnapshots } from "./auditClient";
import { JOB_STATUS, JOB_TYPES, JOB_META } from "./jobTypes";

const LEASE_MS = 5 * 60 * 1000;

// Each handler returns { result, writes } — writes are the Firestore mutations
// the caller applies, keeping this module free of any particular SDK.
const HANDLERS = {
  async [JOB_TYPES.CRAWL_SITE](job, { step }) {
    const { url, maxPages = 20 } = job.params || {};
    step("fetch robots & sitemap");

    const crawl = await crawlSite(url, {
      maxPages,
      budgetMs: 110_000,
      onProgress: ({ crawled, queued }) => step("crawl pages", `${crawled} crawled, ${queued} queued`),
    });

    if (crawl.blockedByRobots) {
      return {
        result: { blockedByRobots: true, pagesCrawled: 0 },
        summary: "robots.txt blocks all crawlers — nothing could be read",
        writes: { site: { crawlBlocked: true } },
      };
    }

    step("build site intelligence");
    const intel = buildIntelligence({ url, crawl });

    step("store");
    const st = crawl.stats;
    const summary = st.singlePageSite
      ? `Everything lives on one page — ${st.totalWords.toLocaleString()} words, no separate pages to crawl`
      : `Crawled ${st.pagesCrawled} page${st.pagesCrawled === 1 ? "" : "s"} of ${st.discovered} found, ${st.totalWords.toLocaleString()} words${st.brokenLinks ? `, ${st.brokenLinks} broken link${st.brokenLinks === 1 ? "" : "s"}` : ""}`;

    return {
      result: {
        pagesCrawled: st.pagesCrawled,
        discovered: st.discovered,
        totalWords: st.totalWords,
        orphanPages: st.orphanPages.length,
        brokenLinks: st.brokenLinks,
        elapsedMs: st.elapsedMs,
      },
      summary,
      writes: {
        site: {
          intelligence: intel,
          crawlStats: crawl.stats,
          crawlBlocked: false,
          faviconUrl: crawl.homepage?.faviconUrl || null,
          lastCrawledAt: new Date(),
        },
        pages: crawl.pages.map((p) => ({
          id: encodeURIComponent(p.path).replace(/%/g, "_").slice(0, 400) || "root",
          data: p,
        })),
      },
      activity: {
        k: "seo",
        text: st.singlePageSite
          ? `Read ${intel.domain} — it's a single page, so there was nothing further to crawl`
          : `Crawled ${st.pagesCrawled} pages on ${intel.domain} and built its profile`,
        why: `Read ${st.totalWords.toLocaleString()} words across ${st.pagesCrawled} page${st.pagesCrawled === 1 ? "" : "s"}`,
        result: `${st.pagesCrawled} page${st.pagesCrawled === 1 ? "" : "s"}`,
      },
    };
  },

  async [JOB_TYPES.AUDIT_SITE](job, { step }) {
    const { url } = job.params || {};
    step("fetch homepage");
    const audit = await runAudit(url);
    step("run checks");
    step("score");
    step("store findings");
    return {
      result: { score: audit.score, critical: audit.counts.critical, warnings: audit.counts.warning },
      summary: `Score ${audit.score} — ${audit.counts.critical} critical, ${audit.counts.warning} warnings`,
      writes: {
        site: {
          audit: {
            score: audit.score,
            counts: audit.counts,
            findings: audit.findings,
            stats: audit.stats,
            ranAt: new Date().toISOString(),
          },
          title: audit.title || undefined,
          faviconUrl: audit.faviconUrl || undefined,
        },
      },
      activity: {
        k: "seo",
        text: `Audited ${audit.finalUrl} — score ${audit.score}`,
        why: `${audit.counts.critical} critical and ${audit.counts.warning} warning findings`,
        result: `Score ${audit.score}`,
      },
    };
  },

  async [JOB_TYPES.COMPETITOR_SCAN](job, { step }) {
    const competitors = job.params?.competitors || [];
    const updates = [];
    let changed = 0;
    for (const c of competitors) {
      step("snapshot each competitor", c.url);
      try {
        const snapshot = await runSnapshot(c.url);
        const changes = diffSnapshots(c.snapshot, snapshot);
        if (changes.length) changed += 1;
        updates.push({ id: c.id, url: c.url, snapshot, changes });
      } catch {
        updates.push({ id: c.id, url: c.url, error: true });
      }
    }
    step("diff against last");
    step("record changes");
    return {
      result: { scanned: updates.length, changed },
      summary: changed
        ? `${changed} of ${updates.length} competitors changed something`
        : `No changes across ${updates.length} competitors`,
      writes: { competitors: updates },
      activity: changed
        ? {
            k: "link",
            text: `Competitor scan: ${changed} of ${updates.length} changed something`,
            why: "Compared each against its previous snapshot",
            result: `${changed} changed`,
          }
        : null,
    };
  },
};

export function jobIsSupported(type) {
  return !!HANDLERS[type];
}

export function leaseExpiry() {
  return new Date(Date.now() + LEASE_MS);
}

/**
 * Executes one job's handler, recording step progress. Never throws — a
 * failure comes back as a FAILED/retryable outcome so the caller can persist
 * it rather than losing the job.
 */
export async function executeJob(job) {
  const meta = JOB_META[job.type];
  if (!HANDLERS[job.type]) {
    return { status: JOB_STATUS.FAILED, error: `No handler for job type "${job.type}"`, steps: [] };
  }

  const steps = [];
  const step = (name, detail) => {
    const existing = steps.find((s) => s.name === name);
    if (existing) {
      existing.detail = detail ?? existing.detail;
      existing.at = new Date().toISOString();
    } else {
      steps.push({ name, detail: detail ?? null, at: new Date().toISOString() });
    }
  };

  const startedAt = Date.now();
  try {
    const out = await HANDLERS[job.type](job, { step });
    return {
      status: JOB_STATUS.COMPLETED,
      steps,
      result: out.result || null,
      summary: out.summary || null,
      writes: out.writes || null,
      activity: out.activity === undefined ? null : out.activity,
      durationMs: Date.now() - startedAt,
      agent: meta?.agent || "MADBOT",
    };
  } catch (err) {
    const attempt = (job.attempt || 1) + 1;
    const canRetry = attempt <= (job.maxAttempts || 3);
    return {
      status: canRetry ? JOB_STATUS.QUEUED : JOB_STATUS.FAILED,
      steps,
      error: String(err?.message || err).slice(0, 400),
      retrying: canRetry,
      nextAttempt: attempt,
      durationMs: Date.now() - startedAt,
      agent: meta?.agent || "MADBOT",
    };
  }
}
