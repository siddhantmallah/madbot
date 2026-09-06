import { NextResponse } from "next/server";
import { assertPublicHost, safeFetch } from "../../../lib/urlGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("empty");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return new URL(raw);
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function extract(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url");

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
    return NextResponse.json({ ok: false, error: "Couldn't read that site in time." });
  }

  try {
    const title = extract(html, /<title[^>]*>([^<]*)<\/title>/i);
    const description =
      extract(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

    // Prefer a <link rel="icon"> the page declares; fall back to /favicon.ico.
    const iconHref =
      extract(html, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
      extract(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i) ||
      extract(html, /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i);
    let faviconUrl = null;
    try {
      faviconUrl = new URL(iconHref || "/favicon.ico", finalUrl).toString();
    } catch {
      faviconUrl = null;
    }

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
