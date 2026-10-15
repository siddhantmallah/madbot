import { NextResponse } from "next/server";
import { runAudit } from "../../../lib/audit";
import { clientIp, LIMITS, rateLimit } from "../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  // Only the absurd is refused before counting; an empty or malformed address
  // still counts toward the limit, so it can't be used to probe for free.
  if (raw && raw.length > 2048) {
    return NextResponse.json({ ok: false, error: "That doesn't look like a valid website address." }, { status: 400 });
  }
  // Opt-in, because it costs one more outbound request (ads.txt) and most
  // people asking for a site report are not publishers.
  const adsense = ["1", "true", "yes"].includes(String(searchParams.get("adsense") || "").toLowerCase());

  // Public, unauthenticated, and each call makes five or six outbound
  // requests to a host the caller picks. Counted in Firestore so the limit
  // holds across serverless instances; the in-memory throttle this replaces
  // reset every time a new instance started.
  const limited = await rateLimit({
    scope: "public.audit",
    key: clientIp(request),
    rules: LIMITS.publicFetch,
    message: "Too many audits just now — give it a minute.",
  });
  if (!limited.ok) return limited.response;

  try {
    const result = await runAudit(raw, { adsense });
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
