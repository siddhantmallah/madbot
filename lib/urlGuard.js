import dns from "node:dns/promises";

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
  if (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("empty");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocol");
  return u;
}

// Refuses anything that resolves to a private/loopback address so this can't be
// pointed at internal infrastructure.
export async function assertPublicHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) {
    throw new Error("unreachable");
  }
  const addresses = await dns.lookup(h, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIP(a.address, a.family))) {
    throw new Error("unreachable");
  }
}

export async function safeFetch(url, { timeoutMs = 8000, capBytes = 400_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "MADBOTBot/1.0 (+https://getmadbot.com)" },
    });
    const elapsedMs = Date.now() - startedAt;

    let body = "";
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < capBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        received += value.length;
      }
      reader.cancel().catch(() => {});
      return { ok: res.ok, status: res.status, finalUrl: res.url || url, body, bytes: received, elapsedMs };
    }
    body = (await res.text()).slice(0, capBytes);
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, body, bytes: body.length, elapsedMs };
  } finally {
    clearTimeout(timer);
  }
}
