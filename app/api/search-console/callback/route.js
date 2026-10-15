import { NextResponse } from "next/server";
import { exchangeCode, oauthConfigured, originFor, saveConnection, verifyState } from "../../../../lib/googleOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Google sends the person after they approve (or decline) Search Console
 * access. The state was signed by us when the connection started, names the
 * organisation and who started it, and expires after ten minutes, so a code
 * can't be attached to an organisation by anyone else. Always ends on the
 * dashboard, saying how it went.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const origin = originFor(request);
  const back = (params) => NextResponse.redirect(`${origin}/dashboard?${new URLSearchParams(params)}`);

  if (!oauthConfigured()) return back({ gsc: "error", reason: "not_configured" });
  if (url.searchParams.get("error")) {
    return back({ gsc: "error", reason: url.searchParams.get("error") === "access_denied" ? "declined" : "google" });
  }
  const state = verifyState(url.searchParams.get("state"));
  if (!state) return back({ gsc: "error", reason: "expired" });
  const code = url.searchParams.get("code");
  if (!code) return back({ gsc: "error", reason: "google" });

  try {
    const tokens = await exchangeCode({ code, origin });
    await saveConnection({ orgId: state.orgId, uid: state.uid, tokens });
    return back({ gsc: "connected" });
  } catch (err) {
    console.error("[search-console/callback]", err?.code || "", err?.message || err);
    return back({ gsc: "error", reason: err?.code === "scope_missing" ? "scope" : err?.code === "no_refresh_token" ? "no_refresh" : "exchange" });
  }
}
