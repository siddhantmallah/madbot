import { NextResponse } from "next/server";
import { verifiedUid } from "../../../lib/licenseServer";
import { safeFetch } from "../../../lib/urlGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A favicon that will not fit in this is not a favicon.
const CAP_BYTES = 100_000;

const ALLOWED_TYPES = [
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/svg+xml",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/**
 * Re-serves a connected site's favicon from our own origin.
 *
 * Needed because a browser will refuse to render one directly. certnotify.com,
 * for instance, sends `Cross-Origin-Resource-Policy: same-origin` with its
 * icon, which tells the browser not to let another origin embed it, so the
 * <img> failed and the dashboard fell back to a letter tile. That is the
 * fallback working, but a letter where a logo should be looks like a bug and it
 * happens on a lot of well-configured sites.
 *
 * Fetched here rather than through Google's favicon service on purpose. That
 * service works and is one line, but it would send every MADBOT customer's
 * client-site domain to Google on every page view, which is a disclosure the
 * privacy policy would have to carry for a cosmetic gain.
 *
 * Signed-in only. Otherwise this is an open image proxy on our bandwidth and
 * our domain's reputation. The URL still goes through safeFetch, so an SSRF
 * attempt from a signed-in account is refused the same as anywhere else.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const uid = await verifiedUid(request.headers.get("x-id-token"));
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const target = searchParams.get("url");
  if (!target) return NextResponse.json({ ok: false, error: "No url." }, { status: 400 });

  try {
    const out = await safeFetch(target, { timeoutMs: 6000, capBytes: CAP_BYTES, binary: true });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: `Icon responded with ${out.status}.` }, { status: 404 });
    }

    const type = (out.contentType || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) {
      // Refusing anything that is not an image keeps this from becoming a
      // general-purpose content proxy by way of a query parameter.
      return NextResponse.json({ ok: false, error: "That is not an image." }, { status: 415 });
    }

    return new NextResponse(out.data, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(out.bytes),
        // A favicon changes about never, and a day of caching keeps the
        // dashboard from re-fetching one on every navigation.
        "Cache-Control": "private, max-age=86400",
        // Belt and braces: we are re-serving somebody else's bytes, so do not
        // let a browser sniff them into something executable.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "unreachable") return NextResponse.json({ ok: false, error: "Not publicly reachable." }, { status: 400 });
    if (msg === "protocol" || msg === "port" || msg === "credentials" || msg === "empty") {
      return NextResponse.json({ ok: false, error: "That address cannot be fetched." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Could not fetch that icon." }, { status: 502 });
  }
}
