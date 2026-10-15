import { NextResponse } from "next/server";
import { buildBuyerProfile } from "../../../../lib/leadEngine";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { reserve, record } from "../../../../lib/costControl";
import { failure, fields, LIMITS, rateLimit, readJson, reply, z } from "../../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ idToken: fields.idToken, siteId: fields.siteId });

/**
 * Infers who buys from this site, so the customer can correct it.
 *
 * Deliberately separate from discovery, and cheap: one classification call, no
 * web search, no lead credits. It costs BUYER_PROFILE action credits from the
 * account's allowance (lib/credits.js), refunded if nothing usable comes back. Everything downstream depends on this being
 * right — a wrong buyer profile spends every lead credit on the wrong companies
 * and puts irrelevant prospects in front of the customer, which costs their
 * trust in the feature and possibly their reputation. This is the cheapest
 * place in the pipeline to catch that, so it's a separate, confirmable step.
 *
 * The site's intelligence is read here rather than posted by the browser. It
 * used to arrive in the body, unbounded, and went straight into the prompt;
 * that let any trial account send megabytes per call to a route nothing
 * metered. Now its input is the server's own record of the site, and it is
 * both metered and rate limited.
 */
export async function POST(request) {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId } = body.data;

  const auth = await authorize(idToken, FEATURES.LEADS);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const limited = await rateLimit({ scope: "ai.leadProfile", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  const snap = await adminDb().collection("users").doc(auth.orgId).collection("sites").doc(siteId).get();
  if (!snap.exists) return reply(404, "That site isn't on your account.");
  const intel = snap.data()?.intelligence;
  if (!intel) return reply(400, "Crawl the site first — the buyer profile is inferred from what it says.");

  const gate = await reserve({
    orgId: auth.orgId,
    siteId,
    subscription: auth.subscription,
    action: "BUYER_PROFILE",
    job: "lead_classify",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: gate.status || 429 }
    );
  }

  try {
    const { usage, ...profile } = await buildBuyerProfile({ intel });
    await record(gate.hold, usage);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    // Nothing usable came back, so nothing is charged.
    await record(gate.hold, { failed: true });
    if (err?.code === "not_configured") return reply(503, "Profile building isn't switched on yet.", { code: err.code });
    // A coded error is one of ours, written for the customer. Anything else came
    // from a provider or the runtime and stays in the logs.
    if (err?.code) return reply(422, err.message, { code: err.code });
    return failure("leads.profile", err, "Couldn't work out a buyer profile just now. Try again.", 422);
  }
}
