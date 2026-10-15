// scripts/prune-seeded-data.cjs — finding the fabricated records the August
// 2026 signup seed wrote, and nothing else.
//   node --no-warnings --import ./tests/_register.mjs tests/seedPrune.test.mjs
//
// The fixtures aren't hand-copied. The seed functions are pulled out of git at
// the two commits that wrote fabricated data and run, and each record is then
// shaped the way that commit's lib/sites.js persisted it. If the matchers miss
// a record those versions really wrote, this fails.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const require = createRequire(import.meta.url);
const prune = require("../scripts/prune-seeded-data.cjs");

const dir = mkdtempSync(path.join(tmpdir(), "madbot-seed-"));
async function seedAt(commit) {
  const src = execFileSync("git", ["show", `${commit}:lib/seed.js`], { encoding: "utf8" });
  const file = path.join(dir, `seed-${commit}.mjs`);
  writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

// The two ends of the range that wrote fabricated data.
const early = await seedAt("7400e6b"); // invented activity and approvals
const late = await seedAt("1de44ba"); // invented leads, content and approvals

const site = { url: "https://acme-widgets.example", title: "Acme Widgets" };
const domain = "acme-widgets.example";

// Persisted the way each commit's addActivity / addApproval / addLead /
// addContentItem stored them.
const activity = early.baseActivitySeed(domain, "Acme Widgets").map((e) => ({ ...e, undone: false, createdAt: "t" }));
const approvals = [
  ...early.approvalSeeds(domain, "Acme Widgets"),
  ...late.approvalSeeds(domain, "Acme Widgets"),
].map((e) => ({ ...e, status: "pending", createdAt: "t" }));
const leads = late.leadSeeds(site).map((e) => ({ ...e, status: "queued", createdAt: "t" }));
const content = late.contentSeeds(site).map((e) => ({ status: "draft", ...e, createdAt: "t" }));

suite("prune-seeded-data — every fabricated record is found");

await test("all six invented leads", () => {
  eq(leads.length, 6, "seeded leads");
  eq(leads.filter(prune.isSeededLead).length, 6, "matched");
});

await test("all eight invented content items", () => {
  eq(content.length, 8, "seeded content");
  eq(content.filter(prune.isSeededContent).length, 8, "matched");
});

await test("the four invented activity claims, and not the homepage read that really happened", () => {
  const matched = activity.filter(prune.isSeededActivity).map((a) => a.text);
  eq(matched.length, 4, `matched ${JSON.stringify(matched)}`);
  truthy(!matched.some((t) => t.startsWith("Read ")), "the real read is kept");
});

await test("every invented approval, still pending as the seed wrote it", () => {
  eq(approvals.filter(prune.isSeededApproval).length, approvals.length, "matched");
});

await test("an invented approval someone already clicked is still invented", () => {
  eq(prune.isSeededApproval({ ...approvals[0], status: "yes" }), true, "approved");
  eq(prune.isSeededApproval({ ...approvals[0], status: "no" }), true, "declined");
});

suite("prune-seeded-data — real records are never touched");

await test("a real lead is kept, even for a company with a seeded name", () => {
  const real = { co: "Fen & Co", domain: "fenandco.example", stage: "shortlisted", why: "Two matching signals in the same week" };
  eq(prune.isSeededLead(real), false, "matched");
});

await test("a real article is kept, even with a seeded title", () => {
  eq(prune.isSeededContent({ title: "Guest post pitch", status: "draft", article: "…", words: 900 }), false, "matched");
  eq(prune.isSeededContent({ title: "Acme: the definitive guide", status: "draft" }), false, "no calendar shape");
});

await test("real activity is kept, including the honest seed and job results", () => {
  for (const a of [
    ...late.baseActivitySeed(domain).map((e) => ({ ...e, undone: false })),
    { k: "seo", text: "Fixed missing meta descriptions and orphan pages", why: "…", result: "Done" },
    { k: "seo", text: `Crawled 12 pages on ${domain} and built its profile`, why: "…", result: "12 pages" },
  ]) {
    eq(prune.isSeededActivity(a), false, a.text);
  }
});

await test("a real outreach approval is kept, even with a seeded title", () => {
  const real = { kind: "outreach", title: "Listing on a relevant directory", subject: "Hello", to: "x@y.example", status: "pending" };
  eq(prune.isSeededApproval(real), false, "matched");
});

report();
