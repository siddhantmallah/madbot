// Server-side job execution. Deliberately transport-agnostic: the same runner
// serves a user-triggered run today and a cron-triggered sweep once a service
// account exists, so autonomy is a scheduling change rather than a rewrite.

import { crawlSite } from "./crawler";
import { buildIntelligence } from "./intelligence";
import { runAudit, runSnapshot } from "./audit";
import { diffSnapshots } from "./auditClient";
import { JOB_STATUS, JOB_TYPES, JOB_META } from "./jobTypes";
import { runVisibilityCheck, generateQuestions } from "./aiVisibility";
import { discoverCompanies, shortlist, qualifyCompany, findContactRoute } from "./leadEngine";

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

HANDLERS[JOB_TYPES.AI_VISIBILITY] = async function aiVisibility(job, { step }) {
  const { domain, brandName, questions, intel } = job.params || {};
  step("build buying questions");
  // Questions normally arrive pre-approved by the user. A cron run has nobody
  // to approve them, so it derives its own.
  const set = questions?.length ? questions : (await generateQuestions({ intel })).questions;

  step("ask each engine", `0 of ${set.length}`);
  const check = await runVisibilityCheck({
    domain,
    brandName: brandName || intel?.business?.name || null,
    questions: set,
    onProgress: ({ done, total }) => step("ask each engine", `${done} of ${total}`),
  });

  step("analyse answers");
  step("store results");

  const who = check.brandName || domain;
  const pct = Math.round(check.mentionRate * 100);
  return {
    result: {
      engine: check.engineLabel,
      asked: check.questionsAsked,
      mentions: check.mentions,
      mentionRate: `${pct}%`,
      avgPosition: check.avgPosition,
    },
    summary:
      check.questionsAsked === 0
        ? "Every question was skipped — nothing could be measured this run."
        : check.mentions === 0
        ? `Claude named ${who} in none of the ${check.questionsAsked} buying questions`
        : `Named in ${check.mentions} of ${check.questionsAsked} buying questions (${pct}%)`,
    writes: {
      site: { aiVisibility: check, lastVisibilityCheckAt: new Date() },
    },
    activity: {
      k: "seo",
      text:
        check.mentions === 0
          ? `AI visibility: ${who} wasn't named in any of ${check.questionsAsked} buying questions`
          : `AI visibility: ${who} named in ${check.mentions} of ${check.questionsAsked} buying questions`,
      why: `Put the questions your buyers ask to ${check.engineLabel}, with web search on`,
      result: `${pct}% mention rate`,
    },
  };
};

HANDLERS[JOB_TYPES.LEAD_DISCOVER] = async function leadDiscover(job, { step }) {
  const { profile, max = 30 } = job.params || {};
  if (!profile?.searchQueries?.length) {
    throw new Error("No confirmed buyer profile. Confirm one before searching for companies.");
  }

  step("search for companies");
  const found = await discoverCompanies({
    profile,
    max,
    onProgress: ({ found: n }) => step("search for companies", `${n} found`),
  });

  step("read each homepage", `${found.companies.length} to check`);
  // No model here — this is the cheap filter, and it's where most candidates
  // are dropped before anything expensive sees them.
  const { shortlisted, rejected } = await shortlist({
    companies: found.companies,
    profile,
    max: 12,
    onProgress: ({ shortlisted: k, checked }) => step("read each homepage", `${k} kept of ${checked} read`),
  });

  step("shortlist");
  step("store");

  return {
    result: { discovered: found.companies.length, shortlisted: shortlisted.length, dropped: rejected.length },
    summary: shortlisted.length
      ? `Found ${found.companies.length} companies, ${shortlisted.length} worth a closer look`
      : `Found ${found.companies.length} companies, none matched closely enough to qualify`,
    writes: {
      // Stored unqualified. Nothing here is a lead yet — qualification is a
      // separate, metered step the customer chooses to run.
      leads: shortlisted.map((c) => ({
        id: c.domain.replace(/[^a-z0-9]/gi, "_").slice(0, 200),
        data: {
          co: c.name,
          domain: c.domain,
          stage: "shortlisted",
          signals: c.signals || null,
          matchedOn: c.matchedOn || [],
          foundVia: c.foundVia || null,
          pageTitle: c.pageTitle || null,
          why: c.why || null,
          fit: null,
          score: null,
          draft: null,
        },
      })),
      site: { leadSearch: { ranAt: new Date().toISOString(), discovered: found.companies.length, shortlisted: shortlisted.length, droppedReasons: rejected.slice(0, 12).map((r) => `${r.domain}: ${r.reason}`) } },
    },
    activity: {
      k: "lead",
      text: `Searched for companies matching your buyer profile — ${shortlisted.length} shortlisted`,
      why: `${found.companies.length} found, ${rejected.length} dropped before any paid analysis`,
      result: `${shortlisted.length} to qualify`,
    },
    usage: found.usage,
  };
};

HANDLERS[JOB_TYPES.LEAD_QUALIFY] = async function leadQualify(job, { step }) {
  const { profile, companies = [], customerDomain } = job.params || {};
  if (!companies.length) throw new Error("No companies to qualify.");

  const out = [];
  let usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };

  for (const [i, company] of companies.entries()) {
    step("read their site", `${i + 1} of ${companies.length}`);
    const q = await qualifyCompany({ company, profile, customerDomain });
    usage.inputTokens += q.usage?.inputTokens || 0;
    usage.outputTokens += q.usage?.outputTokens || 0;

    step("score against your buyer profile", `${i + 1} of ${companies.length}`);

    // Person-level data only where the company earned it. A company that didn't
    // qualify never has a human associated with it at all.
    let contact = null;
    if (q.qualified && q.personLookupJustified) {
      step("find a contact route", company.domain);
      contact = await findContactRoute({ company: q });
    }
    out.push({ ...q, contact });
  }

  step("store");
  const qualified = out.filter((q) => q.qualified);

  return {
    result: { assessed: out.length, qualified: qualified.length },
    summary: qualified.length
      ? `${qualified.length} of ${out.length} companies qualified`
      : `None of the ${out.length} companies qualified against your buyer profile`,
    writes: {
      leads: out.map((q) => ({
        id: q.domain.replace(/[^a-z0-9]/gi, "_").slice(0, 200),
        data: {
          stage: q.qualified ? "qualified" : "rejected",
          // "fit" is what the existing screen reads, kept so nothing else breaks.
          fit: q.score >= 70 ? "Hot" : q.score >= 40 ? "Warm" : "Cold",
          score: q.score ?? 0,
          why: q.reasoning || null,
          problemYouSolve: q.problemYouSolve || null,
          intentSignals: q.intentSignals || [],
          openingLine: q.openingLine || null,
          pagesRead: q.pagesRead || 0,
          contactEmail: q.contact?.preferred || null,
          contactIsGeneric: q.contact?.isGenericInbox ?? null,
          contactProvenance: q.contact?.provenance || null,
          analysedAt: q.analysedAt || new Date().toISOString(),
        },
      })),
    },
    activity: qualified.length
      ? {
          k: "lead",
          text: `Qualified ${qualified.length} of ${out.length} companies`,
          why: "Read each company's own pages and scored them against your buyer profile",
          result: `${qualified.length} qualified`,
        }
      : null,
    usage,
  };
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
      // Passed through so the cost controller can replace its estimate with
      // what the call actually consumed.
      usage: out.usage || null,
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
