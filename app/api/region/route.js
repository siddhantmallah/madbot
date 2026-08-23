import { NextResponse } from "next/server";
import { REGIONS, DEFAULT_REGION } from "../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Country codes to the region we price in. Anything unlisted falls through to
// the default rather than guessing — showing someone the wrong currency is
// worse than showing them the international one.
const EU = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
];

function regionFor(country) {
  if (!country) return null;
  const c = country.toUpperCase();
  if (c === "IN") return "IN";
  if (c === "GB") return "GB";
  if (EU.includes(c)) return "EU";
  if (c === "US") return "US";
  return null;
}

/**
 * Where the visitor appears to be, for pricing.
 *
 * Advisory only. It decides which currency to show first, never what someone is
 * charged — the charge is set when a licence is created, from the region stored
 * on it. A VPN gets you a different price list, not a different invoice, and
 * the page offers a manual switcher for anyone the header gets wrong.
 */
export async function GET(request) {
  const h = request.headers;
  // Vercel and Cloudflare both expose the resolved country; the order is just
  // most-specific-host-first.
  const country =
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("x-country-code") ||
    null;

  const detected = regionFor(country);

  return NextResponse.json(
    {
      ok: true,
      country,
      region: detected || DEFAULT_REGION,
      detected: !!detected,
      currency: REGIONS[detected || DEFAULT_REGION].currency,
    },
    // Cacheable per-country at the edge; pricing doesn't change per request.
    { headers: { "Cache-Control": "public, max-age=3600", Vary: "x-vercel-ip-country" } }
  );
}
