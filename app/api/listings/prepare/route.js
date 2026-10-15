import { NextResponse } from "next/server";
import { writeListing } from "../../../../lib/listingPipeline";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";
import { DIRECTORIES } from "../../../../lib/listings";
import { failure, fields, LIMITS, rateLimit, readJson, siteContext, z } from "../../../../lib/apiGuard";

const Body = z.object({
  idToken: fields.idToken,
  siteId: fields.siteId,
  // Own-property check, not `in`: "constructor" is in every object.
  directoryId: z.string().refine((id) => Object.hasOwn(DIRECTORIES, id), "Unknown directory."),
  site: siteContext,
});

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

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, siteId, site, directoryId } = body.data;

  const auth = await authorize(idToken, FEATURES.LISTINGS);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const limited = await rateLimit({ scope: "ai.listings", key: auth.uid, rules: LIMITS.ai });
  if (!limited.ok) return limited.response;

  const gate = await reserve({
    orgId: auth.orgId,
    siteId,
    subscription: auth.subscription,
    action: "LISTING_COPY",
    job: "listing_copy",
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: gate.status || 429 }
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
    return failure("listings.prepare", err, "Writing failed. Nothing was charged; try again.", 200);
  }
}
