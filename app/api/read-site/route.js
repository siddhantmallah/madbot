import { NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inRange(intIp, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (intIp & mask) === (ipv4ToInt(base) & mask);
}

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return (
    inRange(n, "10.0.0.0", 8) ||
    inRange(n, "172.16.0.0", 12) ||
    inRange(n, "192.168.0.0", 16) ||
    inRange(n, "127.0.0.0", 8) ||
    inRange(n, "169.254.0.0", 16) ||
    inRange(n, "0.0.0.0", 8)
  );
}

function isPrivateIP(address, family) {
  if (family === 4) return isPrivateIPv4(address);
  const a = address.toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true; // link-local / ULA
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("empty");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return new URL(raw);
}

function extract(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
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
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address, a.family))) {
      return NextResponse.json({ ok: false, error: "That address isn't reachable." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't resolve that domain." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "MADBOTBot/1.0 (+https://madbot.com)" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `That site responded with ${res.status}.` });
    }

    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      const cap = 300_000;
      while (received < cap) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        received += value.length;
      }
      reader.cancel().catch(() => {});
    } else {
      html = (await res.text()).slice(0, 300_000);
    }

    const title = extract(html, /<title[^>]*>([^<]*)<\/title>/i);
    const description =
      extract(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

    return NextResponse.json({
      ok: true,
      url: target.toString(),
      title: title || null,
      description: description || null,
    });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ ok: false, error: "Couldn't read that site in time." });
  }
}
