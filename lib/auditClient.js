// Pure snapshot-diffing, safe to import from client components. Kept separate
// from lib/audit.js because that one pulls in node:dns for its SSRF guards.

export function diffSnapshots(prev, next) {
  if (!prev) return [];
  const out = [];
  if (prev.title !== next.title) {
    out.push({ kind: "title", text: `Changed their page title to “${(next.title || "").slice(0, 70)}”` });
  }
  if (prev.description !== next.description) {
    out.push({ kind: "meta", text: "Rewrote their meta description" });
  }
  if (prev.h1 && next.h1 && prev.h1 !== next.h1) {
    out.push({ kind: "headline", text: `Changed their main headline to “${next.h1.slice(0, 70)}”` });
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
  if (Math.abs(wordDelta) > 150) {
    out.push({ kind: "content", text: `${wordDelta > 0 ? "Added" : "Cut"} roughly ${Math.abs(wordDelta)} words of copy` });
  }
  const newSchema = (next.schemaTypes || []).filter((t) => !(prev.schemaTypes || []).includes(t));
  if (newSchema.length) {
    out.push({ kind: "schema", text: `Started marking up ${newSchema.slice(0, 3).join(", ")} in structured data` });
  }
  return out;
}
