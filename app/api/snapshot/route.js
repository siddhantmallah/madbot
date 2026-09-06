import { NextResponse } from "next/server";
import { runSnapshot } from "../../../lib/audit";
import { authorize } from "../../../lib/licenseServer";
import { FEATURES } from "../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Snapshots one competitor page.
 *
 * Signed in and licensed. This had no authentication of any kind, which made
 * it a general-purpose fetcher anyone could point at any URL on our
 * infrastructure and our time, and competitor watching is a paid feature the
 * dashboard already gates on the client.
 *
 * An earlier version of this comment claimed the SSRF guards stopped it
 * reaching anything internal. That was wrong at the time: safeFetch followed
 * redirects without re-checking them, so a public host could bounce it to
 * loopback. Fixed in lib/urlGuard.js, which now validates every hop.
 *
 * The token arrives as a header rather than a query parameter so it stays out
 * of logs and browser history.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const auth = await authorize(request.headers.get("x-id-token"), FEATURES.COMPETITORS);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }

  try {
    const snap = await runSnapshot(searchParams.get("url"));
    return NextResponse.json({ ok: true, snapshot: snap });
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "empty" || msg === "protocol" || err instanceof TypeError) {
      return NextResponse.json({ ok: false, error: "That doesn't look like a valid address." }, { status: 400 });
    }
    if (msg === "unreachable") {
      return NextResponse.json({ ok: false, error: "That address isn't publicly reachable." }, { status: 400 });
    }
    if (err?.code === "bad_status") {
      return NextResponse.json({ ok: false, error: `Their site responded with ${err.status}.` });
    }
    return NextResponse.json({ ok: false, error: "Couldn't reach that site." });
  }
}
