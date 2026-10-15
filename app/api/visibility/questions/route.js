import { NextResponse } from "next/server";
import { generateQuestions } from "../../../../lib/aiVisibility";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { reserve, record } from "../../../../lib/costControl";
import { failure, fields, LIMITS, rateLimit, readJson, reply, z } from "../../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ idToken: fields.idToken, siteId: fields.siteId });

export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.ANTHROPIC_API_KEY });
}

/**
 * Works out the unbranded buyer questions for a site. Split out from the check
 * itself so the user sees — and approves — exactly what will be asked before
 * spending anything on web-searched answers. Drafting them costs
 * VISIBILITY_QUESTIONS action credits (lib/credits.js), refunded on failure.
 *
 * Reads the site's intelligence itself rather than taking it from the body,
 * for the reason given in /api/leads/profile.
 */
export async function POST(request) {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId } = body.data;

  const auth = await authorize(idToken, FEATURES.AI_VISIBILITY);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const limited = await rateLimit({ scope: "ai.visibilityQuestions", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  const snap = await adminDb().collection("users").doc(auth.orgId).collection("sites").doc(siteId).get();
  if (!snap.exists) return reply(404, "That site isn't on your account.");
  const intel = snap.data()?.intelligence;
  if (!intel) return reply(400, "Crawl the site first.");

  const gate = await reserve({
    orgId: auth.orgId,
    siteId,
    subscription: auth.subscription,
    action: "VISIBILITY_QUESTIONS",
    job: "visibility_questions",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: gate.status || 429 }
    );
  }

  try {
    const { usage, ...out } = await generateQuestions({ intel });
    await record(gate.hold, usage);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    // No usable questions came back, so nothing is charged.
    await record(gate.hold, { failed: true });
    if (err?.code === "not_configured") return reply(503, "AI visibility isn't switched on yet.", { code: err.code });
    // A coded error is one of ours, written for the customer ("crawl more
    // pages"). Anything else came from a provider and stays in the logs.
    if (err?.code) return reply(422, err.message, { code: err.code });
    return failure("visibility.questions", err, "Couldn't work out the questions just now. Try again.", 422);
  }
}
