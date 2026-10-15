import { NextResponse } from "next/server";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";
import { draftFix, readPage } from "../../../../lib/fixPipeline";
import { failure, fields, LIMITS, rateLimit, readJson, z } from "../../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  idToken: fields.idToken,
  siteId: fields.siteId,
  // What the Opportunities screen shows. The page itself is fetched here, from
  // the site's own address on file, never from a URL in the request.
  opportunity: z.object({
    id: fields.text(200, "The opportunity id").min(1),
    title: fields.text(300, "The title").min(1),
    detail: fields.text(2000, "The detail").nullish(),
    fix: fields.text(1000, "The fix").nullish(),
    area: fields.text(60).nullish(),
    source: fields.text(40).nullish(),
  }),
});

/**
 * Drafts the fix for one opportunity: the snippet, where it goes, and how to
 * check it. Part of the opportunities feature, so every plan has it; metered
 * as SEO_RECOMMEND. The caller puts the result in Approvals.
 */
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, notConfigured: true, error: "Drafting fixes isn't switched on: no Anthropic API key is configured on the server." });
  }
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId, opportunity } = body.data;

  const auth = await authorize(idToken, FEATURES.OPPORTUNITIES);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null }, { status: auth.status });
  }
  const limited = await rateLimit({ scope: "ai.fix", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  const siteSnap = await adminDb().collection("users").doc(auth.orgId).collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return NextResponse.json({ ok: false, error: "No such site in your organisation." }, { status: 404 });
  const site = siteSnap.data();
  if (!site.url) return NextResponse.json({ ok: false, error: "This site has no address on file." }, { status: 400 });

  const gate = await reserve({ orgId: auth.orgId, siteId, subscription: auth.subscription, action: "SEO_RECOMMEND", job: "seo_recommend" });
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null }, { status: gate.status || 429 });
  }

  try {
    const page = await readPage(site.url);
    const fix = await draftFix({ opportunity, page, businessName: site.intelligence?.business?.name || site.title || null });
    await record(gate.hold, fix.usage);
    return NextResponse.json({
      ok: true,
      fix: { summary: fix.summary, where: fix.where, snippets: fix.snippets, check: fix.check, assumptions: fix.assumptions, pageUrl: page.url },
    });
  } catch (err) {
    await record(gate.hold, { failed: true });
    if (err?.code === "fetch") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "refused" || err?.code === "empty") return NextResponse.json({ ok: false, error: `${err.message} Nothing was charged.` });
    if (["protocol", "port", "unreachable", "too_many_redirects"].includes(String(err?.message))) {
      return NextResponse.json({ ok: false, error: "Couldn't read your page to base the fix on. Check the site is up, then try again." });
    }
    return failure("opportunities.fix", err, "Drafting the fix failed. Nothing was charged; try again.", 200);
  }
}
