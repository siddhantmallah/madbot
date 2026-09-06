import { NextResponse } from "next/server";
import { writeListing } from "../../../../lib/listingPipeline";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";
import { DIRECTORIES } from "../../../../lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Whether writing works is answered by /api/ai-status, which makes a live call.
// A key that is present but revoked is still present, so presence is not an
// answer.
export async function GET() {
  return NextResponse.json({ ok: true, aiStatusAt: "/api/ai-status" });
}

/**
 * Writes the copy for one directory.
 *
 * One directory per request rather than all nine in a batch. Nine sequential
 * model calls would sit near the platform timeout, and a batch that times out
 * halfway leaves the customer unable to tell which four succeeded.
 */
export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "Listing copy isn't switched on — no Anthropic API key is configured on the server." },
      { status: 200 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, site, directoryId } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });
  if (!DIRECTORIES[directoryId]) {
    return NextResponse.json({ ok: false, error: `Unknown directory "${directoryId}".` }, { status: 400 });
  }

  const auth = await authorize(idToken, FEATURES.LISTINGS);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }

  const gate = await reserve({
    uid: auth.uid,
    siteId,
    subscription: auth.subscription,
    action: "LISTING_COPY",
    job: "listing_copy",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: 429 }
    );
  }

  try {
    const result = await writeListing({
      directoryId,
      siteContext: {
        name: site?.name || site?.domain || "this business",
        summary: site?.summary || site?.description || "",
        audience: site?.audience || null,
        differentiator: site?.differentiator || null,
      },
      sitePages: site?.pages || [],
      voice:
        site?.voice === "a"
          ? "Short, direct sentences. Plain words. No corporate throat-clearing."
          : "Professional and thorough, never padded or vague.",
      rules: site?.rules || [],
    });

    await record(gate.hold, result.usage);

    return NextResponse.json({
      ok: true,
      directoryId,
      copy: result.copy,
      claims: result.claims,
      problems: result.problems,
      ready: result.ready,
    });
  } catch (err) {
    await record(gate.hold, { failed: true });
    if (err?.code === "refused") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "empty") return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    return NextResponse.json({ ok: false, error: `Writing failed: ${String(err?.message || err).slice(0, 200)}` }, { status: 200 });
  }
}
