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
