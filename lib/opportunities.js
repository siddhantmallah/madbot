// Turns everything MADBOT has measured into one ranked list of things worth
// doing. Four sources feed it: the technical audit, competitor snapshots, the
// AI visibility check and Search Console.
//
// Two rules hold throughout. Every opportunity traces to a specific
// measurement, carried in `evidence` so the panel can show its working. And no
// industry benchmarks are invented — "position 14 with 320 impressions" is a
// fact from their own data; "your CTR is below the 3.2% average for this
// vertical" would be a number I made up.

import { hostnameOf, shortSiteName } from "./seed";

const AREA_STYLE = {
  "AI & structured data": { bg: "var(--color-accent-2-500)", fg: "var(--color-bg)" },
  Crawlability: { bg: "var(--color-accent)", fg: "var(--color-bg)" },
  Content: { bg: "var(--color-accent-400)", fg: "var(--color-accent-900)" },
  Foundations: { bg: "var(--color-accent-2-300)", fg: "var(--color-accent-2-900)" },
  Sharing: { bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" },
  Performance: { bg: "var(--color-neutral-300)", fg: "var(--color-text)" },
  "AI visibility": { bg: "var(--color-accent-2-500)", fg: "var(--color-bg)" },
  Competitors: { bg: "var(--color-neutral-400)", fg: "var(--color-text)" },
  Search: { bg: "var(--color-accent-300)", fg: "var(--color-accent-900)" },
};

export const SOURCE_LABELS = {
  audit: "Technical audit",
  competitor: "Competitor watch",
  visibility: "AI visibility",
  search: "Search Console",
};

// Short labels for the bubbles — finding titles are too long to sit inside a
// circle, so each gets a compact stand-in.
function shortLabel(title) {
  if (/one page/i.test(title)) return "Split the one-pager";
  if (/structured data|schema/i.test(title)) return "Add schema markup";
  if (/FAQ or Q&A/i.test(title)) return "FAQ markup";
  if (/meta description/i.test(title)) return "Fix meta description";
  if (/^Title is/i.test(title)) return "Rewrite the title";
  if (/H1/i.test(title)) return "Fix the H1";
  if (/alt text/i.test(title)) return "Image alt text";
  if (/words/i.test(title)) return "Deepen the copy";
  if (/Open Graph/i.test(title)) return "Social preview";
  if (/canonical/i.test(title)) return "Canonical tags";
  if (/sitemap/i.test(title)) return "Sitemap";
  if (/robots/i.test(title)) return "robots.txt";
  if (/HTTPS/i.test(title)) return "Move to HTTPS";
  if (/viewport/i.test(title)) return "Mobile viewport";
  if (/respond|script/i.test(title)) return "Speed";
  if (/other page|internal pages/i.test(title)) return "Build out pages";
  if (/lang attribute/i.test(title)) return "Declare language";
  if (/favicon/i.test(title)) return "Add a favicon";
  return title.length > 26 ? `${title.slice(0, 24)}…` : title;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

/**
 * Ranks an opportunity. All three inputs are 1-5.
 *
 * impact     — how much it plausibly moves the needle
 * confidence — how sure the measurement is. A crawled fact is 5; a competitor's
 *              intent inferred from a title change is 2.
 * effort     — how much work it is, so a cheap win beats an equal-impact slog
 *
 * Effort divides by its square root, not by itself. A plain division let
 * trivia win: an over-long title (impact 3, effort 1) outscored having no
 * structured data at all (impact 5, effort 2), and "an assistant never names
 * you" sorted near the bottom purely for taking a few days. Effort should
 * separate otherwise-similar work, not outweigh whether the work matters.
 */
function score({ impact, confidence, effort }) {
  return Math.round(((impact * confidence) / Math.sqrt(effort)) * 3);
}

// Severity is a hard tier above score. "Costing you now" must never sort below
// a cosmetic nice-to-have, however cheap the nice-to-have is.
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

function byUrgencyThenScore(a, b) {
  const tier = (SEVERITY_RANK[a.severity] ?? 1) - (SEVERITY_RANK[b.severity] ?? 1);
  return tier !== 0 ? tier : b.score - a.score;
}

// ---------------------------------------------------------------------------
// Source: the technical audit
// ---------------------------------------------------------------------------

const EFFORT_BY_AREA = {
  Foundations: 1,
  Sharing: 1,
  "AI & structured data": 2,
  Crawlability: 3,
  Content: 4,
  Performance: 3,
};

function fromAudit(site) {
  const findings = (site.audit?.findings || []).filter((f) => f.severity !== "good");
  return findings.map((f) => {
    const impact = f.severity === "critical" ? 5 : 3;
    const effort = EFFORT_BY_AREA[f.area] || 3;
    return {
      id: `audit-${slug(f.title)}`,
      source: "audit",
      severity: f.severity,
      area: f.area,
      title: f.title,
      detail: f.detail,
      fix: f.fix,
      // Directly observed on the page, so nothing is being inferred.
      evidence: `Found on ${hostnameOf(site.url || "")}${site.audit?.ranAt ? ` when audited ${new Date(site.audit.ranAt).toLocaleDateString()}` : ""}.`,
      impact,
      effort,
      confidence: 5,
      score: score({ impact, confidence: 5, effort }),
    };
  });
}

// ---------------------------------------------------------------------------
// Source: competitor snapshots — the diff-to-opportunity step
// ---------------------------------------------------------------------------

/**
 * A competitor changing something is not automatically work for you. What makes
 * it an opportunity is a gap it reveals: they have structured data you don't,
 * or they're publishing while you aren't. Everything else is context, scored
 * low so it sorts below things that are actually actionable.
 */
function fromCompetitors(site, competitors = []) {
  const out = [];
  const mySchema = site.intelligence?.machine?.schemaTypes || [];
  const myPages = site.intelligence?.structure?.pagesCrawled || 0;

  for (const c of competitors) {
    const host = hostnameOf(c.url || "");
    const changes = c.changes || [];
    if (!changes.length) continue;
    const seen = c.lastCheckedAt?.toDate ? c.lastCheckedAt.toDate() : null;
    const when = seen ? ` (seen ${seen.toLocaleDateString()})` : "";

    for (const ch of changes) {
      if (ch.kind === "schema") {
        // Only a gap if they have a type we don't.
        const theirs = (ch.text.match(/marking up ([^i]+) in structured/)?.[1] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const missing = theirs.filter((t) => !mySchema.some((m) => m.toLowerCase() === t.toLowerCase()));
        if (!missing.length) continue;
        out.push({
          id: `comp-schema-${slug(host)}`,
          source: "competitor",
          severity: "warning",
          area: "AI & structured data",
          title: `${host} now marks up ${missing.join(", ")} and you don't`,
          detail: `They added structured data for ${missing.join(", ")}. That's what lets search and answer engines read a page as a specific kind of thing rather than prose. Your crawl found ${mySchema.length ? `only ${mySchema.join(", ")}` : "no structured data at all"}.`,
          fix: `Add ${missing.join(", ")} structured data to the matching pages on your site.`,
          evidence: `Competitor snapshot diff on ${host}${when}.`,
          impact: 4,
          effort: 2,
          confidence: 5,
          score: score({ impact: 4, confidence: 5, effort: 2 }),
        });
      } else if (ch.kind === "new pages") {
        const count = Number(ch.text.match(/Added (\d+) page/)?.[1] || 0);
        if (!count) continue;
        // Publishing while you're static is the gap; matching page-for-page is not.
        const behind = myPages > 0 && myPages < 5;
        out.push({
          id: `comp-pages-${slug(host)}`,
          source: "competitor",
          severity: behind ? "warning" : "info",
          area: "Content",
          title: `${host} published ${count} new page${count === 1 ? "" : "s"}`,
          detail: `${ch.text}. ${behind ? `Your site has ${myPages} page${myPages === 1 ? "" : "s"} crawled, so they're building surface area you don't have.` : "Worth reading to see what they're targeting."}`,
          fix: behind
            ? "Look at what they're covering, then plan pages for the questions your buyers actually ask."
            : `Read the new pages on ${host} and decide whether the topics are worth covering.`,
          evidence: `Competitor snapshot diff on ${host}${when}.`,
          impact: behind ? 4 : 2,
          effort: 4,
          confidence: 4,
          score: score({ impact: behind ? 4 : 2, confidence: 4, effort: 4 }),
        });
      } else if (ch.kind === "title" || ch.kind === "headline") {
        // Their intent is inferred, not measured, so confidence stays low.
        out.push({
          id: `comp-position-${slug(host)}-${ch.kind}`,
          source: "competitor",
          severity: "info",
          area: "Competitors",
          title: `${host} changed how they describe themselves`,
          detail: `${ch.text}. A repositioning usually follows something — a new audience, a new product, or a keyword they've decided to chase.`,
          fix: "Read the change and decide whether it targets a buyer you also want.",
          evidence: `Competitor snapshot diff on ${host}${when}.`,
          impact: 2,
          effort: 1,
          confidence: 2,
          score: score({ impact: 2, confidence: 2, effort: 1 }),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source: the AI visibility check
// ---------------------------------------------------------------------------

function fromVisibility(site) {
  const v = site.aiVisibility;
  if (!v || !v.questionsAsked) return [];
  const out = [];
  const who = v.brandName || v.domain;
  const rivals = (v.topRivals || []).slice(0, 4).map((r) => r.name);
  const checked = v.ranAt ? new Date(v.ranAt).toLocaleDateString() : null;
  const evidence = `${v.questionsAsked} buying question${v.questionsAsked === 1 ? "" : "s"} put to ${v.engineLabel} with web search on${checked ? `, ${checked}` : ""}.`;

  if (v.mentions === 0) {
    out.push({
      id: "vis-absent",
      source: "visibility",
      severity: "critical",
      area: "AI visibility",
      title: `${v.engineLabel} never names you`,
      detail: `Asked ${v.questionsAsked} unbranded questions a buyer would ask before hearing of you, ${who} came up zero times.${rivals.length ? ` It named ${rivals.join(", ")} instead.` : ""} Anyone researching this way is being sent elsewhere.`,
      fix: "Publish short, quotable answers to those exact questions, mark them up with FAQ structured data, and get named on third-party pages an assistant is likely to read.",
      evidence,
      impact: 5,
      effort: 3,
      confidence: 5,
      score: score({ impact: 5, confidence: 5, effort: 3 }),
    });
  } else if (v.mentionRate < 0.5) {
    out.push({
      id: "vis-patchy",
      source: "visibility",
      severity: "warning",
      area: "AI visibility",
      title: `Named in only ${v.mentions} of ${v.questionsAsked} buying questions`,
      detail: `${who} surfaces for some questions and not others.${rivals.length ? ` The names that come up instead: ${rivals.join(", ")}.` : ""} The gaps are where buyers never hear of you.`,
      fix: "Look at which questions missed, then cover those specific topics in a directly quotable way.",
      evidence,
      impact: 4,
      effort: 3,
      confidence: 5,
      score: score({ impact: 4, confidence: 5, effort: 3 }),
    });
  }

  // Mentioned but never linked is its own problem: the recommendation happens
  // and the click doesn't.
  if (v.mentions > 0 && v.citations === 0) {
    out.push({
      id: "vis-uncited",
      source: "visibility",
      severity: "warning",
      area: "AI visibility",
      title: "Named, but never linked",
      detail: `${v.engineLabel} mentioned ${who} in ${v.mentions} answer${v.mentions === 1 ? "" : "s"} without once linking ${v.domain}. The recommendation happens and the visit doesn't.`,
      fix: "Make the site the obvious source for the claims being made about you — clear canonical pages per topic, and consistent naming so the brand and the domain are unmistakably the same thing.",
      evidence,
      impact: 3,
      effort: 3,
      confidence: 4,
      score: score({ impact: 3, confidence: 4, effort: 3 }),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Source: Search Console
// ---------------------------------------------------------------------------

/**
 * Only objective facts from the property's own data. Page-two rankings and
 * impressions-without-clicks are measured; "below average CTR" would need a
 * benchmark nobody here has.
 */
function fromSearch(search) {
  if (!search?.topQueries?.length) return [];
  const out = [];

  const pageTwo = search.topQueries
    .filter((q) => q.position > 10 && q.position <= 20 && q.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);

  for (const q of pageTwo) {
    out.push({
      id: `gsc-p2-${slug(q.query)}`,
      source: "search",
      severity: "warning",
      area: "Search",
      title: `Page two for "${q.query}"`,
      detail: `Average position ${q.position.toFixed(1)} with ${q.impressions.toLocaleString()} impressions and ${q.clicks} click${q.clicks === 1 ? "" : "s"} in the last 28 days. Google already thinks you're relevant — nobody scrolls that far.`,
      fix: `Strengthen the page that ranks for "${q.query}": answer the query directly near the top, and add internal links to it from related pages.`,
      evidence: `Search Console, last 28 days${search.siteUrl ? ` for ${search.siteUrl}` : ""}.`,
      impact: 5,
      effort: 2,
      confidence: 5,
      score: score({ impact: 5, confidence: 5, effort: 2 }),
    });
  }

  const seenNoClicks = search.topQueries
    .filter((q) => q.clicks === 0 && q.impressions >= 50 && q.position <= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);

  for (const q of seenNoClicks) {
    out.push({
      id: `gsc-noclick-${slug(q.query)}`,
      source: "search",
      severity: "warning",
      area: "Search",
      title: `Shown ${q.impressions.toLocaleString()} times for "${q.query}", clicked never`,
      detail: `You rank at position ${q.position.toFixed(1)} — on the first page — and got no clicks in 28 days. People are seeing the listing and choosing something else.`,
      fix: "Rewrite that page's title and meta description so they answer the query in the searcher's own words.",
      evidence: `Search Console, last 28 days${search.siteUrl ? ` for ${search.siteUrl}` : ""}.`,
      impact: 4,
      effort: 1,
      confidence: 5,
      score: score({ impact: 4, confidence: 5, effort: 1 }),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

// Radial layout: the highest-scoring work sits biggest and nearest the middle,
// where the eye lands first.
function layout(items) {
  const CX = 470;
  const CY = 300;
  const positions = [];
  const inner = items.slice(0, 4);
  const outer = items.slice(4);

  const place = (list, radius, startAngle) => {
    list.forEach((item, idx) => {
      const step = (Math.PI * 2) / Math.max(list.length, 3);
      const a = startAngle + idx * step;
      const d = item.severity === "critical" ? 104 : item.severity === "warning" ? 84 : 66;
      positions.push({
        ...item,
        d,
        x: Math.round(CX + Math.cos(a) * radius - d / 2),
        y: Math.round(CY + Math.sin(a) * radius - d / 2),
      });
    });
  };

  place(inner, 175, -Math.PI / 2);
  place(outer, 288, -Math.PI / 2 + 0.45);
  return positions;
}

/**
 * @param site       the stored site document
 * @param extras.competitors  competitor docs, for the diff-to-opportunity step
 * @param extras.search       Search Console payload, which lives in session
 *                            state rather than on the site document
 */
export function buildOpportunities(site, { competitors = [], search = null } = {}) {
  const domain = hostnameOf(site.url || "");
  const name = shortSiteName(site);

  const all = [
    ...fromAudit(site),
    ...fromCompetitors(site, competitors),
    ...fromVisibility(site),
    ...fromSearch(search),
  ];

  const sources = {
    audit: !!site.audit,
    competitor: competitors.some((c) => (c.changes || []).length),
    visibility: !!site.aiVisibility?.questionsAsked,
    search: !!search?.topQueries?.length,
  };

  if (all.length === 0) {
    return { plays: [], nodes: {}, domain, name, sources, hasAudit: !!site.audit, score: site.audit?.score ?? null };
  }

  // Most urgent first, best-scoring within that, and cap what's drawn — a graph
  // of thirty bubbles tells you nothing. The count of what didn't fit is
  // reported rather than quietly dropped.
  const ranked = all.sort(byUrgencyThenScore);
  const shown = ranked.slice(0, 9);

  const positioned = layout(
    shown.map((o) => {
      const style = AREA_STYLE[o.area] || AREA_STYLE.Foundations;
      return { ...o, label: shortLabel(o.title), bg: style.bg, fg: style.fg, fs: "10.5px" };
    })
  );

  const nodes = {};
  positioned.forEach((p) => {
    nodes[p.id] = p;
  });

  return {
    plays: positioned,
    nodes,
    domain,
    name,
    sources,
    hasAudit: !!site.audit,
    score: site.audit?.score ?? null,
    total: all.length,
    hidden: Math.max(0, all.length - shown.length),
  };
}

// The ordered steps MADBOT would take for one opportunity. Derived from its own
// fix text plus its area, so it stays specific to what was found.
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
    "AI visibility": ["Write the answer a buyer is actually asking for", "Mark it up so machines can parse it", "Re-run the visibility check to see if it moved"],
    Competitors: ["Read what changed on their site", "Decide whether it targets a buyer you want", "Note it, or plan a response"],
    Search: ["Open the page that already ranks", "Answer the query directly, near the top", "Re-check position after a couple of weeks"],
  };
  return [...base, ...(byArea[play.area] || [])].slice(0, 4);
}
