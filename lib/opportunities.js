// Turns a stored audit into the opportunity map. Every play here traces back
// to something actually observed on the user's site, so the panel can say what
// it found rather than offering a generic checklist.

import { hostnameOf, shortSiteName } from "./seed";

const AREA_STYLE = {
  "AI & structured data": { bg: "var(--color-accent-2-500)", fg: "var(--color-bg)" },
  Crawlability: { bg: "var(--color-accent)", fg: "var(--color-bg)" },
  Content: { bg: "var(--color-accent-400)", fg: "var(--color-accent-900)" },
  Foundations: { bg: "var(--color-accent-2-300)", fg: "var(--color-accent-2-900)" },
  Sharing: { bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" },
  Performance: { bg: "var(--color-neutral-300)", fg: "var(--color-text)" },
};

// Short labels for the bubbles — the finding titles are too long to sit inside
// a circle, so each area gets a compact stand-in.
function shortLabel(f) {
  const t = f.title;
  if (/one page/i.test(t)) return "Split the one-pager";
  if (/structured data|schema/i.test(t)) return "Add schema markup";
  if (/FAQ or Q&A/i.test(t)) return "FAQ markup";
  if (/meta description/i.test(t)) return "Fix meta description";
  if (/^Title is/i.test(t)) return "Rewrite the title";
  if (/H1/i.test(t)) return "Fix the H1";
  if (/alt text/i.test(t)) return "Image alt text";
  if (/words/i.test(t)) return "Deepen the copy";
  if (/Open Graph/i.test(t)) return "Social preview";
  if (/canonical/i.test(t)) return "Canonical tags";
  if (/sitemap/i.test(t)) return "Sitemap";
  if (/robots/i.test(t)) return "robots.txt";
  if (/HTTPS/i.test(t)) return "Move to HTTPS";
  if (/viewport/i.test(t)) return "Mobile viewport";
  if (/respond|script/i.test(t)) return "Speed";
  if (/other page|internal pages/i.test(t)) return "Build out pages";
  if (/lang attribute/i.test(t)) return "Declare language";
  if (/favicon/i.test(t)) return "Add a favicon";
  return t.length > 26 ? `${t.slice(0, 24)}…` : t;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// Radial layout: severity drives size, and criticals sit nearer the middle
// where the eye lands first.
function layout(items) {
  const CX = 470;
  const CY = 300;
  const positions = [];
  const criticals = items.filter((i) => i.severity === "critical");
  const rest = items.filter((i) => i.severity !== "critical");

  const place = (list, radius, startAngle) => {
    list.forEach((item, idx) => {
      const step = (Math.PI * 2) / Math.max(list.length, 3);
      const a = startAngle + idx * step;
      const d = item.severity === "critical" ? 104 : 74;
      positions.push({
        ...item,
        d,
        x: Math.round(CX + Math.cos(a) * radius - d / 2),
        y: Math.round(CY + Math.sin(a) * radius - d / 2),
      });
    });
  };

  place(criticals, 175, -Math.PI / 2);
  place(rest, 288, -Math.PI / 2 + 0.45);
  return positions;
}

export function buildOpportunities(site) {
  const domain = hostnameOf(site.url || "");
  const name = shortSiteName(site);
  const findings = (site.audit?.findings || []).filter((f) => f.severity !== "good");

  if (findings.length === 0) return { plays: [], nodes: {}, hasAudit: !!site.audit };

  const items = findings.slice(0, 9).map((f) => {
    const style = AREA_STYLE[f.area] || AREA_STYLE.Foundations;
    const id = slug(f.title);
    return {
      id,
      severity: f.severity,
      area: f.area,
      title: f.title,
      detail: f.detail,
      fix: f.fix,
      label: shortLabel(f),
      bg: style.bg,
      fg: style.fg,
      fs: "10.5px",
    };
  });

  const positioned = layout(items);
  const nodes = {};
  positioned.forEach((p) => {
    nodes[p.id] = p;
  });

  return { plays: positioned, nodes, domain, name, hasAudit: true, score: site.audit?.score ?? null };
}

// The ordered steps MADBOT would take for one finding. Derived from the
// finding's own fix text plus the area, so it stays specific.
export function planFor(play) {
  if (!play) return [];
  const base = [play.fix].filter(Boolean);
  const byArea = {
    "AI & structured data": ["Draft the markup for the page types you have", "Validate it against Google's structured-data test", "Re-check that answer engines can parse it"],
    Crawlability: ["Map which pages deserve to exist", "Create and interlink them", "Submit the updated sitemap"],
    Content: ["Outline against the questions buyers ask", "Write it in your voice", "Add internal links from related pages"],
    Foundations: ["Apply the change site-wide, not just the homepage", "Re-crawl to confirm it took", "Watch for movement over the next few weeks"],
    Sharing: ["Add the tags", "Test how a shared link renders", "Set a fallback image"],
    Performance: ["Find what's actually blocking the response", "Fix the biggest contributor first", "Re-measure"],
  };
  return [...base, ...(byArea[play.area] || [])].slice(0, 4);
}
