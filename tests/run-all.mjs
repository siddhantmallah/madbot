// Runs every suite and prints combined totals.
//   node --no-warnings tests/run-all.mjs
// Needs `next dev` on http://localhost:3000 for the api/ssrf suites.
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  "urlguard.test.mjs",
  "auditclient.test.mjs",
  "audit.test.mjs",
  "crawler.test.mjs",
  "officialsources.test.mjs",
  "api.test.mjs",
  "ssrf.test.mjs",
];

const totals = [];
for (const file of SUITES) {
  const args = ["--no-warnings", "--import", pathToFileURL(path.join(here, "_register.mjs")).href, path.join(here, file)];
  const out = await new Promise((resolve) => {
    let buf = "";
    const p = spawn(process.execPath, args, { cwd: path.join(here, "..") });
    p.stdout.on("data", (d) => {
      buf += d;
      process.stdout.write(d);
    });
    p.stderr.on("data", (d) => (buf += d));
    p.on("close", () => resolve(buf));
  });
  const m = out.match(/totals: (\d+) passed, (\d+) failed, (\d+) skipped/);
  totals.push({ file, pass: +(m?.[1] ?? 0), fail: +(m?.[2] ?? 0), skip: +(m?.[3] ?? 0), parsed: !!m });
}

console.log("\n\n================ COMBINED ================");
let P = 0;
let F = 0;
let S = 0;
for (const t of totals) {
  P += t.pass;
  F += t.fail;
  S += t.skip;
  console.log(`${t.file.padEnd(28)} ${String(t.pass).padStart(3)} pass  ${String(t.fail).padStart(3)} fail  ${String(t.skip).padStart(2)} skip${t.parsed ? "" : "  (suite did not finish)"}`);
}
console.log(`${"TOTAL".padEnd(28)} ${String(P).padStart(3)} pass  ${String(F).padStart(3)} fail  ${String(S).padStart(2)} skip`);
if (F) process.exitCode = 1;
