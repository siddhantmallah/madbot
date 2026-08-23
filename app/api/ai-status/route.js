import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../../../lib/aiModels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether the AI features can actually run.
 *
 * Checking that the key exists is not the same as checking it works. A key that
 * has been revoked, disabled, or run out of credit is still present in the
 * environment, so the old `!!process.env.ANTHROPIC_API_KEY` check reported
 * everything as ready and then every button failed with a 401 the user couldn't
 * interpret.
 *
 * States: absent (nothing configured), ready, rejected (key present but the API
 * refused it), no_credit, rate_limited, unreachable.
 */

// One live probe per window, shared across every page load. The probe itself is
// a single token on the cheapest model, so the cost is rounding error — but
// without the cache a busy dashboard would send one per render.
const TTL_MS = 5 * 60 * 1000;
let cached = { at: 0, payload: null };

export async function GET(request) {
  const force = new URL(request.url).searchParams.get("fresh") === "1";

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      state: "absent",
      ready: false,
      message: "No Anthropic API key is set on the server, so nothing that needs a model can run.",
    });
  }

  if (!force && cached.payload && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true });
  }

  let payload;
  try {
    const client = new Anthropic();
    await client.messages.create({
      model: MODELS.cheap.id,
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    });
    payload = { state: "ready", ready: true, message: null, model: MODELS.cheap.label };
  } catch (err) {
    const status = err?.status || null;
    payload =
      status === 401
        ? {
            state: "rejected",
            ready: false,
            message:
              "The Anthropic API key is set but being rejected. If it was disabled or rotated, update ANTHROPIC_API_KEY.",
          }
        : status === 402 || /credit/i.test(err?.message || "")
        ? { state: "no_credit", ready: false, message: "The Anthropic account has no credit remaining." }
        : status === 429
        ? { state: "rate_limited", ready: false, message: "Rate limited by Anthropic. This usually clears on its own." }
        : {
            state: "unreachable",
            ready: false,
            message: `Couldn't reach Anthropic: ${String(err?.message || err).slice(0, 140)}`,
          };
    payload.status = status;
  }

  cached = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
