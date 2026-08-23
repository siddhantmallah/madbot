export function ago(m) {
  if (m < 1) return "just now";
  if (m < 60) return Math.round(m) + " min";
  if (m < 1440) return Math.round(m / 60) + " hr";
  return Math.round(m / 1440) + " d";
}

export function minutesAgo(ts) {
  if (!ts || typeof ts.toMillis !== "function") return 0;
  return Math.max(0, (Date.now() - ts.toMillis()) / 60000);
}

export function kindColor(k) {
  return (
    {
      seo: "var(--color-accent-200)",
      content: "var(--color-accent-300)",
      lead: "var(--color-accent-2-200)",
      link: "var(--color-neutral-300)",
      win: "var(--color-accent-2-500)",
    }[k] || "var(--color-neutral-200)"
  );
}

export function autInfo(v) {
  if (v < 25) return { label: "Watch only", desc: "I look, I report, I touch nothing at all." };
  if (v < 48) return { label: "Suggest", desc: "A plan on your desk each morning. You press the buttons." };
  if (v < 80) return { label: "Let it rip", desc: "I publish, distribute and prospect on my own. I ask before spending." };
  return { label: "Full send", desc: "I spend too, inside your budget, and hand you the receipts." };
}

export const SCREEN_TITLES = {
  growth: "Growth",
  opps: "Opportunities",
  content: "Content & calendar",
  leads: "Lead intelligence",
  appr: "Approvals",
  vis: "AI search visibility",
  aut: "Autonomy & permissions",
  runs: "Agent runs",
  log: "Activity log",
  billing: "Billing & licence",
};
