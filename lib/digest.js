import { hostnameOf } from "./seed";

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

export function buildDigest({ site, activity, approvals, leads, content }) {
  const domain = hostnameOf(site.url);
  const pending = approvals.filter((a) => a.status === "pending");
  const sentLeads = leads.filter((l) => l.status === "sent");
  const published = content.filter((c) => c.status === "published");
  const recent = activity.slice(0, 5);

  const subject = `MADBOT digest: ${domain}`;

  const recentHtml = recent.length
    ? recent.map((a) => `<li>${esc(a.text)} — <em>${esc(a.result || "Done")}</em></li>`).join("")
    : "<li>Nothing logged yet.</li>";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#201e1d">
      <h2 style="margin:0 0 4px">This week on ${esc(domain)}</h2>
      <p style="color:#645c50;margin:0 0 20px">${activity.length} actions logged, ${pending.length} waiting on you.</p>
      <h3 style="margin:0 0 8px;font-size:15px">Recent activity</h3>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">${recentHtml}</ul>
      <h3 style="margin:0 0 8px;font-size:15px">Needs you</h3>
      <p style="font-size:14px;margin:0 0 20px">${pending.length} approval${pending.length === 1 ? "" : "s"} pending${pending.length ? ": " + pending.map((a) => esc(a.title)).join(", ") : "."}</p>
      <h3 style="margin:0 0 8px;font-size:15px">Leads &amp; content</h3>
      <p style="font-size:14px;margin:0 0 20px">${sentLeads.length} outreach message${sentLeads.length === 1 ? "" : "s"} sent · ${published.length} piece${published.length === 1 ? "" : "s"} published</p>
      <p style="font-size:12px;color:#a19786">Sent by MADBOT because you asked for a digest right now.</p>
    </div>
  `;

  const text = [
    `This week on ${domain}`,
    `${activity.length} actions logged, ${pending.length} waiting on you.`,
    "",
    "Recent activity:",
    ...recent.map((a) => `- ${a.text} (${a.result || "Done"})`),
    "",
    `Needs you: ${pending.length} approval(s) pending${pending.length ? ": " + pending.map((a) => a.title).join(", ") : ""}`,
    `Leads & content: ${sentLeads.length} outreach sent, ${published.length} published`,
  ].join("\n");

  return { subject, html, text };
}
