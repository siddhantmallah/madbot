// Minimal pass/fail reporter. One line per case, process.exitCode = 1 on any
// failure. Deliberately dependency-free so it runs with bare `node`.

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];
let suiteName = "suite";

export function suite(name) {
  suiteName = name;
  console.log(`\n=== ${name} ===`);
}

export function ok(name, extra = "") {
  pass += 1;
  console.log(`PASS  ${name}${extra ? "  — " + extra : ""}`);
}

export function bad(name, detail) {
  fail += 1;
  process.exitCode = 1;
  failures.push({ suite: suiteName, name, detail });
  console.log(`FAIL  ${name}\n        ${detail}`);
}

export function skipped(name, why) {
  skip += 1;
  console.log(`SKIP  ${name}  — ${why}`);
}

/** Run a synchronous or async assertion body; a throw is a failure. */
export async function test(name, fn) {
  try {
    const r = await fn();
    ok(name, typeof r === "string" ? r : "");
  } catch (err) {
    bad(name, err && err.message ? err.message : String(err));
  }
}

/** Assert a promise rejects. Returns the error for further inspection. */
export async function rejects(fn) {
  let value;
  try {
    value = await fn();
  } catch (err) {
    return err;
  }
  const e = new Error(`expected a rejection, got ${JSON.stringify(value)?.slice(0, 200)}`);
  e.noReject = true;
  throw e;
}

export function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
  }
}

export function truthy(v, what) {
  if (!v) throw new Error(`${what}: expected truthy, actual ${JSON.stringify(v)}`);
}

export function report() {
  console.log(`\n--- ${suiteName} totals: ${pass} passed, ${fail} failed, ${skip} skipped ---`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f, i) => console.log(`  ${i + 1}. [${f.suite}] ${f.name}\n     ${f.detail}`));
  }
  return { pass, fail, skip };
}

process.on("exit", () => {});
