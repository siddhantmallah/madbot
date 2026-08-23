import { NextResponse } from "next/server";
import { generateQuestions } from "../../../../lib/aiVisibility";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.ANTHROPIC_API_KEY });
}

/**
 * Works out the unbranded buyer questions for a site. Split out from the check
 * itself so the user sees — and approves — exactly what will be asked before
 * spending anything on web-searched answers.
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

  const auth = await authorize(idToken, FEATURES.AI_VISIBILITY);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  if (!intel) {
    return NextResponse.json({ ok: false, error: "Crawl the site first." }, { status: 400 });
  }

  try {
    const out = await generateQuestions({ intel });
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    const status = err?.code === "not_configured" ? 503 : 422;
    return NextResponse.json(
      { ok: false, error: String(err?.message || err), code: err?.code || null },
      { status }
    );
  }
}
