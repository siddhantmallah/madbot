import { NextResponse } from "next/server";
import { executeJob } from "../../../../lib/jobRunner";
import { JOB_STATUS, JOB_TYPES, JOB_FEATURE, JOB_METER } from "../../../../lib/jobTypes";
import { authorize } from "../../../../lib/licenseServer";
import { reserve, record } from "../../../../lib/costControl";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { fields, LIMITS, rateLimit, readJson, reply, z } from "../../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The browser posts its whole job document; only these fields are read, and
// everything the server can know for itself it reads for itself (below).
const Company = z
  .object({
    name: fields.text(300).nullish(),
    domain: fields.domain,
  })
  .passthrough();

const Body = z.object({
  idToken: fields.idToken,
  job: z.object({
    id: z.string().max(128).optional(),
    type: z.enum(Object.values(JOB_TYPES), { error: "Unknown job type." }),
    // Required for every job. Metering used to run only `if (siteId)`, so
    // leaving it out ran any paid job for nothing.
    siteId: fields.siteId,
    uid: z.string().max(128).optional(),
    attempt: z.number().int().min(1).max(10).optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    params: z
      .object({
        maxPages: z.number().int().min(1).max(20).optional(),
        brandName: fields.text(200).nullish(),
        // The questions the customer approved, as /api/visibility/questions
        // returned them: { id, question }. The product generates at most
        // eight; each is one web-searched model call. (This was an array of
        // strings, which refused every check a customer started.)
        questions: z
          .array(z.object({ id: z.string().trim().min(1).max(64), question: fields.text(300) }))
          .max(8, "At most 8 questions per run.")
          .optional(),
        max: z.number().int().min(1).max(30).optional(),
        companies: z.array(Company).max(15, "At most 15 companies per run.").optional(),
      })
      .passthrough()
      .default({}),
  }),
});

function hostnameOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The params a job actually runs with. Whatever the server already holds, it
 * takes from Firestore rather than the request: the site's own URL, its
 * competitors, its intelligence and its confirmed buyer profile. The caller
 * picks what to run, not what it runs against.
 */
async function trustedParams(db, uid, siteId, site, job) {
  const p = job.params || {};
  switch (job.type) {
    case JOB_TYPES.CRAWL_SITE:
      return { url: site.url, maxPages: p.maxPages ?? 20 };
    case JOB_TYPES.AUDIT_SITE:
      return { url: site.url };
    case JOB_TYPES.COMPETITOR_SCAN: {
      const snap = await db
        .collection("users").doc(uid)
        .collection("sites").doc(siteId)
        .collection("competitors").limit(20).get();
      return { competitors: snap.docs.map((d) => ({ id: d.id, url: d.data().url, snapshot: d.data().snapshot || null })) };
    }
    case JOB_TYPES.AI_VISIBILITY:
      return {
        domain: site.intelligence?.domain || hostnameOf(site.url),
        brandName: p.brandName || site.intelligence?.business?.name || null,
        questions: p.questions || [],
        intel: site.intelligence || null,
      };
    case JOB_TYPES.LEAD_DISCOVER:
      return { profile: site.buyerProfile || null, max: p.max ?? 30 };
    case JOB_TYPES.LEAD_QUALIFY:
      return {
        profile: site.buyerProfile || null,
        customerDomain: site.intelligence?.domain || hostnameOf(site.url),
        companies: p.companies || [],
      };
    default:
      return {};
  }
}

/**
 * Runs one job's work and returns the outcome plus the writes to apply. The
 * caller (the signed-in client, holding its own Firestore permissions) commits
 * them — which is what lets this work without handing the browser admin
 * credentials. The cron sweep calls the same executor with admin rights.
 *
 * Order matters: identity, then licence, then budget, then work. Each is
 * cheaper than the one after it, and the expensive one never starts until the
 * cheap checks have passed.
 */
export async function POST(request) {
  const body = await readJson(request, Body, { maxBytes: 256 * 1024 });
  if (!body.ok) return body.response;
  const { idToken, job } = body.data;

  // Identity and licence in one step. The feature comes from the job type, not
  // from the request — the caller doesn't get to nominate which permission it's
  // asking for.
  const auth = await authorize(idToken, JOB_FEATURE[job.type] || null);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  // A job document records the data root it was created under, which is the
  // organisation. One from a different organisation is refused.
  if (job.uid && job.uid !== auth.orgId) {
    return reply(403, "That job belongs to another organisation.");
  }

  const limited = await rateLimit({
    scope: "jobs.run",
    key: auth.uid,
    rules: LIMITS.ai,
    message: "That's a lot of runs in a short time. Give it a few minutes.",
  });
  if (!limited.ok) return limited.response;

  // Every job type is metered, and reserve() refuses a site that isn't real or
  // isn't inside the plan, so there is no path to executeJob without a hold.
  const meter = JOB_METER[job.type];
  if (!meter) return reply(400, "Unknown job type.");
  const gate = await reserve({
    orgId: auth.orgId,
    siteId: job.siteId,
    subscription: auth.subscription,
    action: meter.action,
    job: meter.job,
    // One lead credit per company actually assessed — the cost driver is the
    // company, not the job.
    leadCredits: job.type === JOB_TYPES.LEAD_QUALIFY ? job.params?.companies?.length || 0 : 0,
  });
  if (!gate.ok) {
    // 429 rather than 402 for an exhausted allowance: they have a valid plan,
    // they've used this period's allowance. The difference matters to the
    // message the UI shows. A site that isn't theirs or isn't covered keeps
    // its own status.
    return NextResponse.json(
      {
        ok: false,
        error: gate.reason,
        code: gate.code,
        used: gate.used ?? null,
        allowance: gate.allowance ?? null,
        exhausted: !gate.status,
      },
      { status: gate.status || 429 }
    );
  }
  const hold = gate.hold;

  let outcome;
  try {
    const db = adminDb();
    const siteSnap = await db.collection("users").doc(auth.orgId).collection("sites").doc(job.siteId).get();
    const params = await trustedParams(db, auth.orgId, job.siteId, siteSnap.data() || {}, job);
    outcome = await executeJob({ ...job, uid: auth.orgId, params });
  } catch (err) {
    await record(hold, { failed: true });
    console.error("[jobs.run]", err?.stack || err);
    return reply(500, "The run couldn't start. Nothing was charged.");
  }

  // Replace the reservation's estimate with what it actually cost. A failed job
  // refunds its credits — the customer shouldn't pay for work they didn't get.
  const u = outcome.usage || outcome.result?.usage || outcome.writes?.site?.aiVisibility?.usage || {};
  await record(hold, {
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    webSearches: u.webSearches || 0,
    failed: outcome.status !== JOB_STATUS.COMPLETED,
  });

  return NextResponse.json({
    ok: outcome.status === JOB_STATUS.COMPLETED,
    outcome,
  });
}
