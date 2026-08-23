import { NextResponse } from "next/server";
import { buildBuyerProfile } from "../../../../lib/leadEngine";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Infers who buys from this site, so the customer can correct it.
 *
 * Deliberately separate from discovery, and cheap: one classification call, no
 * web search, no lead credits. Everything downstream depends on this being
 * right — a wrong buyer profile spends every lead credit on the wrong companies
 * and puts irrelevant prospects in front of the customer, which costs their
 * trust in the feature and possibly their reputation. This is the cheapest
 * place in the pipeline to catch that, so it's a separate, confirmable step.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, intel } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const auth = await authorize(idToken, FEATURES.LEADS);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  if (!intel) {
    return NextResponse.json(
      { ok: false, error: "Crawl the site first — the buyer profile is inferred from what it says." },
      { status: 400 }
    );
  }

  try {
    const profile = await buildBuyerProfile({ intel });
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const status = err?.code === "not_configured" ? 503 : 422;
    return NextResponse.json({ ok: false, error: String(err?.message || err), code: err?.code || null }, { status });
  }
}
