// Runs every suite and prints combined totals.
//   node --no-warnings tests/run-all.mjs
//
// Two things here are deliberate, and both are the fix for the same bug.
//
// The suite list is read off disk rather than written down. It used to be a
// hardcoded array of nine files while nineteen existed, so the ten written
// against node:test were never run by this script at all — two consent tests
// sat broken for weeks because nothing anybody ran looked at them. A list you
// have to remember to update is a list that drifts.
//
// And a suite whose output cannot be parsed counts as a FAILURE, not as zero
// of zero. The old version printed "(suite did not finish)" and then added 0
// to both columns, so a suite that crashed on import made the totals greener
// rather than redder.
//
// Both output formats are understood: the harness in _harness.mjs prints a
// "totals:" line, and node:test prints TAP. Neither had to change.
//
// Not included: firestore-rules.test.cjs, which needs the Firestore emulator
// running and has its own script — `npm run test:rules`.
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// These reach the dev server on http://localhost:3000. Run last, so when they
// fail because it is not running, the rest of the report is already on screen.
const NEEDS_DEV_SERVER = new Set(["api.test.mjs", "ssrf.test.mjs", "adminGuard.test.mjs", "seo.test.mjs"]);

const found = fs
  .readdirSync(here)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

const SUITES = [
  ...found.filter((f) => !NEEDS_DEV_SERVER.has(f)),
  ...found.filter((f) => NEEDS_DEV_SERVER.has(f)),
];

if (!SUITES.length) {
  console.error("No *.test.mjs files found in", here);
  process.exit(1);
}

/**
 * Reads the pass/fail/skip counts out of whatever the suite printed.
 *
 * Returns null when neither format is present, which the caller treats as a
 * failed suite rather than an empty one.
 */
function parseTotals(out) {
  const harness = out.match(/totals: (\d+) passed, (\d+) failed, (\d+) skipped/);
  if (harness) return { pass: +harness[1], fail: +harness[2], skip: +harness[3] };

  // node:test's TAP summary. `# fail` is the count that matters; a suite that
  // died before the summary has none of these lines and falls through.
  const pass = out.match(/^# pass (\d+)$/m);
  const fail = out.match(/^# fail (\d+)$/m);
  if (pass && fail) {
    const skip = out.match(/^# skipped (\d+)$/m);
    return { pass: +pass[1], fail: +fail[1], skip: skip ? +skip[1] : 0 };
  }
  return null;
}

const results = [];
for (const file of SUITES) {
  const args = [
    "--no-warnings",
    "--import",
    pathToFileURL(path.join(here, "_register.mjs")).href,
    path.join(here, file),
  ];
  const { out, code } = await new Promise((resolve) => {
    let buf = "";
    const p = spawn(process.execPath, args, { cwd: path.join(here, "..") });
    p.stdout.on("data", (d) => {
      buf += d;
      process.stdout.write(d);
    });
    p.stderr.on("data", (d) => (buf += d));
    p.on("close", (exitCode) => resolve({ out: buf, code: exitCode }));
  });

  const totals = parseTotals(out);
  results.push(
    totals
      ? { file, ...totals, parsed: true, code }
      : // One synthetic failure, so an unreadable suite moves the total in the
        // direction that gets it looked at.
        { file, pass: 0, fail: 1, skip: 0, parsed: false, code }
  );
}

console.log("\n\n================ COMBINED ================");
let P = 0;
let F = 0;
let S = 0;
for (const t of results) {
  P += t.pass;
  F += t.fail;
  S += t.skip;
  const note = t.parsed ? "" : `  (no totals printed, exit ${t.code} — counted as a failure)`;
  console.log(
    `${t.file.padEnd(28)} ${String(t.pass).padStart(3)} pass  ${String(t.fail).padStart(3)} fail  ${String(t.skip).padStart(2)} skip${note}`
  );
}
console.log(
  `${"TOTAL".padEnd(28)} ${String(P).padStart(3)} pass  ${String(F).padStart(3)} fail  ${String(S).padStart(2)} skip`
);
console.log(`${SUITES.length} suites, discovered from ${path.relative(process.cwd(), here) || "."}/`);

if (F) process.exitCode = 1;
