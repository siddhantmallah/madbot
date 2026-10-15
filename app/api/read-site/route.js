import { NextResponse } from "next/server";
import { assertPublicHost, describeFetchFailure, safeFetch } from "../../../lib/urlGuard";
import { extractIcon, metaContent, titleOf } from "../../../lib/htmlParse";
import { clientIp, LIMITS, rateLimit } from "../../../lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("empty");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return new URL(raw);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");
  if (raw && raw.length > 2048) {
    return NextResponse.json({ ok: false, error: "Enter a valid website address." }, { status: 400 });
  }

  // Public and unauthenticated, and it fetches whatever it is given. It had no
  // limit of any kind.
  const limited = await rateLimit({
    scope: "public.readSite",
    key: clientIp(request),
    rules: LIMITS.publicFetch,
    message: "Too many requests just now — give it a minute.",
  });
  if (!limited.ok) return limited.response;

  let target;
  try {
    target = normalizeUrl(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Enter a valid website address." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ ok: false, error: "Only http/https addresses are supported." }, { status: 400 });
  }

  const hostname = target.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname.endsWith(".local")) {
    return NextResponse.json({ ok: false, error: "That address isn't reachable." }, { status: 400 });
  }

  try {
    await assertPublicHost(hostname);
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't resolve that domain." }, { status: 400 });
  }

  let html = "";
  let finalUrl = target.toString();
  try {
    // Through the shared guard. This route used to run its own fetch with
    // redirect:"follow" and its own copy of the private-address table, which
    // meant a public host could redirect it to loopback and the title and
    // description of an internal page came back out of a public endpoint.
    const out = await safeFetch(target, { timeoutMs: 8000, capBytes: 300_000 });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: `That site responded with ${out.status}.` });
    }
    html = out.body;
    finalUrl = out.finalUrl;
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "protocol") return NextResponse.json({ ok: false, error: "Only http and https addresses can be read." }, { status: 400 });
    if (msg === "port") return NextResponse.json({ ok: false, error: "Only standard web ports can be read." }, { status: 400 });
    if (msg === "unreachable") return NextResponse.json({ ok: false, error: "That address isn't publicly reachable." }, { status: 400 });
    if (msg === "too_many_redirects") return NextResponse.json({ ok: false, error: "That address redirects too many times." }, { status: 400 });
    // The rest are the target's own failures, so 200 {ok:false}, but each
    // says what actually happened. Every one used to read "couldn't read that
    // site in time", including a site whose certificate chain is broken,
    // which no amount of waiting fixes.
    return NextResponse.json({ ok: false, error: describeFetchFailure(err) });
  }

  try {
    // The shared extractors, not local regexes: this endpoint is public and the
    // page is whatever the caller points it at. The patterns that used to live
    // here took over a minute on 60 KB of hostile markup.
    const title = titleOf(html);
    const description = metaContent(html, "description");
    const faviconUrl = extractIcon(html, finalUrl);

    return NextResponse.json({
      ok: true,
      url: target.toString(),
      title: title || null,
      description: description || null,
      faviconUrl,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read that site." });
  }
}
