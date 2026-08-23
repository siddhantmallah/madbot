import { NextResponse } from "next/server";
import { runAudit } from "../../../lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Light per-instance throttle. This is a public, unauthenticated endpoint that
// makes outbound requests, so it needs some brake — but serverless instances
// are short-lived, so treat this as a speed bump rather than real rate limiting.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function throttled(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return list.length > MAX_PER_WINDOW;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (throttled(ip)) {
    return NextResponse.json({ ok: false, error: "Too many audits just now — give it a minute." }, { status: 429 });
  }

  try {
    const result = await runAudit(raw);
    return NextResponse.json(result);
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "empty" || msg === "protocol" || err instanceof TypeError) {
      return NextResponse.json({ ok: false, error: "That doesn't look like a valid website address." }, { status: 400 });
    }
    if (msg === "unreachable") {
      return NextResponse.json({ ok: false, error: "That address isn't publicly reachable." }, { status: 400 });
    }
    if (err?.code === "bad_status") {
      return NextResponse.json({ ok: false, error: `The site responded with ${err.status}, so I couldn't read it.` }, { status: 200 });
    }
    if (err?.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "The site took too long to respond." }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Couldn't reach that site. Check the address and try again." }, { status: 200 });
  }
}
