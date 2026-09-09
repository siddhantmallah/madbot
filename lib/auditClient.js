// Pure snapshot-diffing, safe to import from client components. Kept separate
// from lib/audit.js because that one pulls in node:dns for its SSRF guards.

export function diffSnapshots(prev, next) {
  // Both sides guarded. A failed fetch upstream hands this a null `next`, and
  // reading .title off it took the entire change feed down rather than
  // reporting one competitor as unchecked.
  if (!prev || !next) return [];
  const out = [];
  if (prev.title !== next.title) {
    out.push({
      kind: "title",
      text: next.title
        ? `Changed their page title to “${next.title.slice(0, 70)}”`
        : "Removed their page title",
    });
  }
  if (prev.description !== next.description) {
    out.push({ kind: "meta", text: "Rewrote their meta description" });
  }
  // Adding a headline where there was none is a change worth reporting, and
  // requiring both sides to be present meant it never was.
  if (prev.h1 !== next.h1) {
    out.push({
      kind: "headline",
      text: next.h1
        ? `Changed their main headline to “${next.h1.slice(0, 70)}”`
        : "Removed their main headline",
    });
  }
  const newPaths = (next.paths || []).filter((p) => !(prev.paths || []).includes(p));
  const gonePaths = (prev.paths || []).filter((p) => !(next.paths || []).includes(p));
  if (newPaths.length) {
    out.push({
      kind: "new pages",
      text: `Added ${newPaths.length} page${newPaths.length === 1 ? "" : "s"}: ${newPaths.slice(0, 3).join(", ")}`,
    });
  }
  if (gonePaths.length) {
    out.push({
      kind: "removed",
      text: `Removed ${gonePaths.length} page${gonePaths.length === 1 ? "" : "s"}: ${gonePaths.slice(0, 3).join(", ")}`,
    });
  }
  const wordDelta = (next.wordCount || 0) - (prev.wordCount || 0);
  // THRESHOLDS.wordsCritical, not a copy of it. This file declares that
  // constant and told everyone not to restate it, then restated it.
  if (Math.abs(wordDelta) > THRESHOLDS.wordsCritical) {
    out.push({ kind: "content", text: `${wordDelta > 0 ? "Added" : "Cut"} roughly ${Math.abs(wordDelta)} words of copy` });
  }
  const newSchema = (next.schemaTypes || []).filter((t) => !(prev.schemaTypes || []).includes(t));
  if (newSchema.length) {
    out.push({ kind: "schema", text: `Started marking up ${newSchema.slice(0, 3).join(", ")} in structured data` });
  }
  return out;
}

// The lines the audit judges a page by. They live in this client-safe module
// so the report can draw every measurement against the exact number its
// verdict used - the chart and the finding can never disagree. lib/audit.js
// reads these; do not restate them anywhere else.
export const THRESHOLDS = {
  titleMin: 20,
  titleMax: 65,
  descriptionMin: 70,
  descriptionMax: 170,
  wordsCritical: 150,
  wordsWarning: 400,
  pagesLinked: 4,
  altMissingPct: 50,
  responseWarningMs: 1200,
  responseCriticalMs: 2500,
  scripts: 25,
  // Below this share of the delivered bytes, the document is mostly markup.
  textRatioMin: 5,
  // External scripts in <head> with neither async nor defer.
  blockingScripts: 2,
  domElements: 2500,
  // Share of images with no width/height before it counts against the layout.
  dimsMissingPct: 50,
};

/**
 * The bands a score is read in.
 *
 * These were three magic numbers inside the report component. They live here
 * now because the audit needs them too: criticalCeiling() below is expressed
 * in terms of the band edges, and a second copy of "80 is healthy" is exactly
 * the drift this module exists to prevent.
 */
export const BANDS = [
  { min: 80, label: "Healthy", tone: "good" },
  { min: 55, label: "Needs work", tone: "warning" },
  { min: 0, label: "Losing traffic", tone: "critical" },
];

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

// What each critical finding costs the ceiling. Chosen so that four of them
// reach the bottom band — four things actively costing you traffic is the
// point at which "losing traffic" is simply the accurate word.
const CEILING_PER_CRITICAL = 12;

// The lowest score the audit will report. Nothing scores 0: a page that
// answered at all has done one thing right.
export const SCORE_FLOOR = 5;

/**
 * The most a page can score, given how many findings are actively costing it
 * traffic.
 *
 * Scoring by share of achievable health has one failure the raw number cannot
 * fix: a long tail of infrastructure checks that any well-hosted page passes
 * for free — HTTPS, HSTS, a fast response, a small DOM, a real 404 — outvotes
 * the handful of checks about whether the page says anything. So a 21-word
 * placeholder came out thirteen points off a working site, and a page could be
 * called "Healthy" while the report above it listed things "costing you now".
 * That second one is not a calibration quibble, it is the report contradicting
 * itself in two adjacent words.
 *
 * A critical is qualitatively different from a passing header check, and this
 * is where that is stated: one denies the top band outright, and each one
 * lowers the ceiling.
 */
export function criticalCeiling(count) {
  if (!count || count <= 0) return 100;
  // Floored at the same 5 the score is, so this never returns a number outside
  // the range it is a ceiling for. Both callers clamp anyway; handing them a
  // negative ceiling to reason about would just be untidy.
  return Math.max(SCORE_FLOOR, Math.min(BANDS[0].min - 1, 100 - CEILING_PER_CRITICAL * count));
}
