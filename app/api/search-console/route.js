import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://www.googleapis.com/webmasters/v3";

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function gsc(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Search Console returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function totals(rows) {
  return rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + (r.clicks || 0),
      impressions: acc.impressions + (r.impressions || 0),
      positionWeighted: acc.positionWeighted + (r.position || 0) * (r.impressions || 0),
      impressionsForPos: acc.impressionsForPos + (r.impressions || 0),
    }),
    { clicks: 0, impressions: 0, positionWeighted: 0, impressionsForPos: 0 }
  );
}

function summarize(rows) {
  const t = totals(rows);
  return {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    position: t.impressionsForPos ? t.positionWeighted / t.impressionsForPos : 0,
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { token, action, siteUrl } = body || {};
  if (!token) return NextResponse.json({ ok: false, error: "Not connected to Search Console." }, { status: 401 });

  try {
    if (action === "sites") {
      const data = await gsc("/sites", token);
      const sites = (data.siteEntry || [])
        .filter((s) => s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser")
        .map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel }));
      return NextResponse.json({ ok: true, sites });
    }

    if (action === "summary") {
      if (!siteUrl) return NextResponse.json({ ok: false, error: "No property selected." }, { status: 400 });
      const enc = encodeURIComponent(siteUrl);

      // 28 days, and the 28 before that, so the comparison is real rather than modelled.
      const [current, previous, queries, pages] = await Promise.all([
        gsc(`/sites/${enc}/searchAnalytics/query`, token, {
          method: "POST",
          body: JSON.stringify({ startDate: isoDaysAgo(28), endDate: isoDaysAgo(1), dimensions: ["date"], rowLimit: 500 }),
        }),
        gsc(`/sites/${enc}/searchAnalytics/query`, token, {
          method: "POST",
          body: JSON.stringify({ startDate: isoDaysAgo(56), endDate: isoDaysAgo(29), dimensions: ["date"], rowLimit: 500 }),
        }),
        gsc(`/sites/${enc}/searchAnalytics/query`, token, {
          method: "POST",
          body: JSON.stringify({ startDate: isoDaysAgo(28), endDate: isoDaysAgo(1), dimensions: ["query"], rowLimit: 12 }),
        }),
        gsc(`/sites/${enc}/searchAnalytics/query`, token, {
          method: "POST",
          body: JSON.stringify({ startDate: isoDaysAgo(28), endDate: isoDaysAgo(1), dimensions: ["page"], rowLimit: 8 }),
        }),
      ]);

      const curRows = current.rows || [];
      const prevRows = previous.rows || [];

      return NextResponse.json({
        ok: true,
        siteUrl,
        range: { from: isoDaysAgo(28), to: isoDaysAgo(1) },
        current: summarize(curRows),
        previous: summarize(prevRows),
        series: curRows.map((r) => ({ date: r.keys?.[0], clicks: r.clicks || 0, impressions: r.impressions || 0 })),
        topQueries: (queries.rows || []).map((r) => ({
          query: r.keys?.[0],
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0,
        })),
        topPages: (pages.rows || []).map((r) => ({
          page: r.keys?.[0],
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          position: r.position || 0,
        })),
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json(
        { ok: false, error: err.message || "Google refused that request — the connection may have expired.", needsReconnect: true },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: false, error: err.message || "Search Console request failed." }, { status: 200 });
  }
}
