import { hostnameOf } from "./seed";

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

// One shape used by both the inline panel and the email, so what you read in
// the dashboard is exactly what lands in your inbox.
export function digestData({ site, activity, approvals, leads, content, competitors = [], search = null }) {
  const domain = hostnameOf(site.url);
  const pending = approvals.filter((a) => a.status === "pending");
  const sentLeads = leads.filter((l) => l.status === "sent");
  const published = content.filter((c) => c.status === "published");
  const drafts = content.filter((c) => c.status !== "published");
  const recent = activity.slice(0, 5);
  const competitorChanges = competitors.flatMap((c) =>
    (c.changes || []).slice(0, 3).map((ch) => ({ competitor: hostnameOf(c.url), text: ch.text }))
  );

  const lines = [
    { label: "Actions logged", value: activity.length },
    { label: "Waiting on you", value: pending.length },
    { label: "Content planned", value: `${drafts.length} draft${drafts.length === 1 ? "" : "s"}, ${published.length} marked published` },
    { label: "Prospects", value: `${leads.length} listed, ${sentLeads.length} marked sent` },
  ];

  if (search?.current) {
    const c = search.current;
    const p = search.previous || {};
    const delta = (now, before) => {
      if (!before) return null;
      const d = ((now - before) / before) * 100;
      return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
    };
    lines.unshift(
      { label: "Clicks (28d)", value: c.clicks.toLocaleString(), delta: delta(c.clicks, p.clicks) },
      { label: "Impressions (28d)", value: c.impressions.toLocaleString(), delta: delta(c.impressions, p.impressions) },
      { label: "Average position", value: c.position ? c.position.toFixed(1) : "—" }
    );
  }

  return { domain, lines, recent, pending, competitorChanges, hasSearch: !!search?.current };
}

export function buildDigest(input) {
  const d = digestData(input);
  const subject = `MADBOT digest: ${d.domain}`;

  const linesHtml = d.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;color:#645c50;font-size:13px">${esc(l.label)}</td><td style="padding:6px 0;text-align:right;font-size:14px"><strong>${esc(l.value)}</strong>${
          l.delta ? ` <span style="color:#8c491a">${esc(l.delta)}</span>` : ""
        }</td></tr>`
    )
    .join("");

  const recentHtml = d.recent.length
    ? d.recent.map((a) => `<li>${esc(a.text)} — <em>${esc(a.result || "Done")}</em></li>`).join("")
    : "<li>Nothing logged yet.</li>";

  const compHtml = d.competitorChanges.length
    ? d.competitorChanges.map((c) => `<li><strong>${esc(c.competitor)}</strong> — ${esc(c.text)}</li>`).join("")
    : "<li>No changes detected since the last check.</li>";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#201e1d">
      <h2 style="margin:0 0 4px">This week on ${esc(d.domain)}</h2>
      <p style="color:#645c50;margin:0 0 20px">${d.pending.length} thing${d.pending.length === 1 ? "" : "s"} waiting on you.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 22px">${linesHtml}</table>
      <h3 style="margin:0 0 8px;font-size:15px">Recent activity</h3>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">${recentHtml}</ul>
      <h3 style="margin:0 0 8px;font-size:15px">Competitor changes</h3>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">${compHtml}</ul>
      ${
        d.pending.length
          ? `<h3 style="margin:0 0 8px;font-size:15px">Needs you</h3><ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">${d.pending
              .map((a) => `<li>${esc(a.title)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <p style="font-size:12px;color:#a19786">${
        d.hasSearch ? "Search numbers come from your connected Google Search Console property." : "Connect Search Console to include real traffic numbers here."
      }</p>
    </div>
  `;

  const text = [
    `This week on ${d.domain}`,
    ...d.lines.map((l) => `- ${l.label}: ${l.value}${l.delta ? ` (${l.delta})` : ""}`),
    "",
    "Recent activity:",
    ...(d.recent.length ? d.recent.map((a) => `- ${a.text} (${a.result || "Done"})`) : ["- Nothing logged yet."]),
    "",
    "Competitor changes:",
    ...(d.competitorChanges.length ? d.competitorChanges.map((c) => `- ${c.competitor}: ${c.text}`) : ["- None detected."]),
  ].join("\n");

  return { subject, html, text };
}

export { pct };
