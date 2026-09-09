// lib/auditClient.js — diffSnapshots (pure) and the THRESHOLDS contract.
//   node --no-warnings --import ./tests/_register.mjs tests/auditclient.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";
import { BANDS, SCORE_FLOOR, bandFor, criticalCeiling, diffSnapshots, THRESHOLDS } from "../lib/auditClient.js";
import { runSnapshot } from "../lib/audit.js";

suite("lib/auditClient.js — diffSnapshots");

const base = {
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  title: "Acme Widgets — industrial fasteners",
  description: "We make fasteners for industrial customers across Europe.",
  wordCount: 800,
  schemaTypes: ["Organization"],
  h1: "Industrial fasteners, shipped in 48 hours",
  h2Count: 5,
  images: 10,
  distinctPages: 6,
  paths: ["/about", "/pricing", "/contact"],
  htmlKb: 40,
  responseMs: 210,
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
await test("diffSnapshots(null, next) returns an empty array", () => {
  const out = diffSnapshots(null, base);
  if (!Array.isArray(out)) throw new Error(`returned ${typeof out}, not an array`);
  eq(out.length, 0, "diff length");
  return "[]";
});

await test("diffSnapshots(undefined, next) returns an empty array", () => {
  eq(diffSnapshots(undefined, base).length, 0, "diff length");
  return "[]";
});

await test("identical hand-built snapshots produce no diff", () => {
  const out = diffSnapshots(clone(base), clone(base));
  if (out.length) throw new Error(`spurious diffs: ${JSON.stringify(out)}`);
  return "no diff";
});

await test("two live runSnapshot calls of the same URL produce no spurious differences", async () => {
  const a = await runSnapshot("https://example.com/");
  const b = await runSnapshot("https://example.com/");
  const out = diffSnapshots(a, b);
  if (out.length) throw new Error(`spurious diffs across two identical fetches: ${JSON.stringify(out)}`);
  return "stable across two fetches";
});

await test("a change in title, description, word count and schema each shows up exactly once", () => {
  const next = clone(base);
  next.title = "Acme Widgets — bolts, nuts and industrial fasteners";
  next.description = "Fasteners, bolts and nuts for industrial buyers, shipped from three European warehouses.";
  next.wordCount = base.wordCount + 400;
  next.schemaTypes = ["Organization", "FAQPage"];

  const out = diffSnapshots(base, next);
  const byKind = out.reduce((m, d) => ((m[d.kind] = (m[d.kind] || 0) + 1), m), {});
  for (const kind of ["title", "meta", "content", "schema"]) {
    if (byKind[kind] !== 1) throw new Error(`kind "${kind}" appeared ${byKind[kind] || 0} times: ${JSON.stringify(out)}`);
  }
  eq(out.length, 4, "total diff entries");

  const text = Object.fromEntries(out.map((d) => [d.kind, d.text]));
  if (!text.title.includes("bolts, nuts and industrial")) throw new Error(`title text does not quote the new title: ${text.title}`);
  if (!/meta description/i.test(text.meta)) throw new Error(`meta text is not about the description: ${text.meta}`);
  if (!text.content.includes("400")) throw new Error(`content text does not state the delta: ${text.content}`);
  if (!text.schema.includes("FAQPage")) throw new Error(`schema text does not name the new type: ${text.schema}`);
  return out.map((d) => `${d.kind}: ${d.text}`).join(" | ").slice(0, 200);
});

await test("added and removed pages are reported separately with the right counts", () => {
  const next = clone(base);
  next.paths = ["/about", "/pricing", "/careers", "/blog"];
  const out = diffSnapshots(base, next);
  const added = out.find((d) => d.kind === "new pages");
  const gone = out.find((d) => d.kind === "removed");
  truthy(added, "new pages entry");
  truthy(gone, "removed entry");
  if (!added.text.includes("2 pages")) throw new Error(`added text: ${added.text}`);
  if (!gone.text.includes("1 page")) throw new Error(`removed text: ${gone.text}`);
  return `${added.text} / ${gone.text}`;
});

await test("word-count threshold: 150 is quiet, 151 is reported", () => {
  const quiet = clone(base);
  quiet.wordCount = base.wordCount + 150;
  if (diffSnapshots(base, quiet).some((d) => d.kind === "content")) throw new Error("a delta of exactly 150 was reported");
  const loud = clone(base);
  loud.wordCount = base.wordCount + 151;
  if (!diffSnapshots(base, loud).some((d) => d.kind === "content")) throw new Error("a delta of 151 was not reported");
  return "boundary is >150";
});

await test("the diff's 150-word threshold is read from THRESHOLDS, not restated", async () => {
  // lib/auditClient.js's own comment: "do not restate them anywhere else".
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/auditClient.js", import.meta.url), "utf8"));
  const body = src.slice(0, src.indexOf("export const THRESHOLDS"));
  const literal = body.match(/>\s*(\d{2,})/g);
  if (literal) {
    throw new Error(
      `diffSnapshots hard-codes ${literal.join(", ")} in the same file that declares THRESHOLDS and tells callers not ` +
        `to restate them. If THRESHOLDS.wordsCritical (${THRESHOLDS.wordsCritical}) is retuned, the change feed keeps the old number.`
    );
  }
  return "threshold referenced, not restated";
});

await test("removing a title reads sensibly rather than quoting an empty string", () => {
  const next = clone(base);
  next.title = null;
  const out = diffSnapshots(base, next);
  const t = out.find((d) => d.kind === "title");
  truthy(t, "title diff");
  if (/to “”\s*$/.test(t.text) || t.text.endsWith("“”")) {
    throw new Error(`renders as ${JSON.stringify(t.text)} — a removed title should say it was removed, not quote nothing`);
  }
  return t.text;
});

await test("an H1 appearing where there was none is reported", () => {
  const prev = clone(base);
  prev.h1 = null;
  const next = clone(base);
  next.h1 = "Now we have a headline";
  const out = diffSnapshots(prev, next);
  if (!out.some((d) => d.kind === "headline")) {
    throw new Error(
      "the headline branch is guarded by `prev.h1 && next.h1`, so adding an H1 to a page that had none — a real, " +
        "reportable competitor change — produces no entry"
    );
  }
  return "reported";
});

await test("diffSnapshots(prev, null) degrades instead of throwing", () => {
  try {
    const out = diffSnapshots(base, null);
    if (!Array.isArray(out)) throw new Error(`returned ${typeof out}`);
    return `[] (${out.length} entries)`;
  } catch (err) {
    throw new Error(`threw ${err.name}: ${err.message} — a failed snapshot fetch upstream crashes the change feed`);
  }
});

await test("snapshots missing optional arrays do not throw", () => {
  const thin = { title: "t", description: "d", wordCount: 10 };
  const out = diffSnapshots(thin, { title: "t2", description: "d", wordCount: 10 });
  if (!Array.isArray(out)) throw new Error("not an array");
  return `${out.length} entries`;
});

// ---------------------------------------------------------------------------
suite("lib/auditClient.js — THRESHOLDS");

await test("THRESHOLDS has every key lib/audit.js reads, all numeric", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/audit.js", import.meta.url), "utf8"));
  const used = [...new Set([...src.matchAll(/\bT\.([A-Za-z]+)\b/g)].map((m) => m[1]))];
  const missing = used.filter((k) => !(k in THRESHOLDS));
  if (missing.length) throw new Error(`lib/audit.js reads T.${missing.join(", T.")} which THRESHOLDS does not define`);
  const nonNumeric = Object.entries(THRESHOLDS).filter(([, v]) => typeof v !== "number");
  if (nonNumeric.length) throw new Error(`non-numeric thresholds: ${JSON.stringify(nonNumeric)}`);
  const unused = Object.keys(THRESHOLDS).filter((k) => !used.includes(k));
  return `${used.length} used${unused.length ? `, unused: ${unused.join(", ")}` : ""}`;
});

await test("finding copy quotes the same numbers the gauges use", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/audit.js", import.meta.url), "utf8"));
  const mismatches = [];
  if (/truncates around 60/.test(src) && THRESHOLDS.titleMax !== 60) {
    mismatches.push(`title copy says "truncates around 60" but the gauge boundary is titleMax=${THRESHOLDS.titleMax}`);
  }
  if (/inside ~155 characters/.test(src) && THRESHOLDS.descriptionMax !== 155) {
    mismatches.push(`description fix says "inside ~155 characters" but the gauge boundary is descriptionMax=${THRESHOLDS.descriptionMax}`);
  }
  if (mismatches.length) throw new Error(mismatches.join("; "));
  return "copy and gauges agree";
});

// ---------------------------------------------------------------------------
suite("lib/auditClient.js — BANDS and criticalCeiling");

await test("the bands cover every score with no gap and no overlap", () => {
  for (let s = 0; s <= 100; s += 1) {
    const b = bandFor(s);
    truthy(b && b.label, `score ${s} has a band`);
  }
  // Descending mins, so the first match is the highest band that applies.
  for (let i = 1; i < BANDS.length; i += 1) {
    if (BANDS[i].min >= BANDS[i - 1].min) throw new Error(`BANDS are not in descending order at index ${i}`);
  }
  eq(BANDS[BANDS.length - 1].min, 0, "the lowest band starts at 0");
  return BANDS.map((b) => `${b.label}≥${b.min}`).join(", ");
});

await test("a page with no critical findings is not capped at all", () => {
  eq(criticalCeiling(0), 100, "zero criticals");
  eq(criticalCeiling(undefined), 100, "count not supplied");
});

await test("one critical finding denies the top band", () => {
  // The report prints "Costing you now" directly above the score. A page can
  // not be called Healthy while that list has something in it.
  const ceiling = criticalCeiling(1);
  if (bandFor(ceiling).label === BANDS[0].label) {
    throw new Error(`one critical still allows "${BANDS[0].label}" (ceiling ${ceiling})`);
  }
  eq(ceiling, BANDS[0].min - 1, "capped just below the top band");
});

await test("four critical findings reach the bottom band", () => {
  const bottom = BANDS[BANDS.length - 1].label;
  eq(bandFor(criticalCeiling(4)).label, bottom, `four criticals land in "${bottom}"`);
  // Three should not — otherwise the ceiling is doing all the work and the
  // measured score none of it.
  if (bandFor(criticalCeiling(3)).label === bottom) {
    throw new Error(`three criticals already force "${bottom}" (ceiling ${criticalCeiling(3)})`);
  }
  return `3 → ${criticalCeiling(3)}, 4 → ${criticalCeiling(4)}`;
});

await test("the ceiling falls as criticals accumulate and never goes below the floor", () => {
  let prev = criticalCeiling(1);
  for (let n = 2; n <= 12; n += 1) {
    const c = criticalCeiling(n);
    if (c > prev) throw new Error(`ceiling rose from ${prev} to ${c} at ${n} criticals`);
    prev = c;
  }
  const many = criticalCeiling(12);
  if (many < SCORE_FLOOR) throw new Error(`ceiling ${many} is below the documented floor of ${SCORE_FLOOR}`);
  return `12 criticals → ${many}, floor ${SCORE_FLOOR}`;
});

report();
