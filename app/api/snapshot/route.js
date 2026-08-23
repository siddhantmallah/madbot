import { NextResponse } from "next/server";
import { runSnapshot } from "../../../lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
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
