/**
 * Publishes firestore.rules to the live project, and reads it back to prove it
 * landed.
 *
 * This exists because the rules sat undeployed for a long time without anyone
 * noticing. Forgetting is silent: the code ships, a screen reads nothing, and
 * the only trace is a permission-denied in the browser console. Two whole
 * features were dead in production that way.
 *
 * Creating a ruleset validates the syntax server-side before it is released,
 * so a mistake is a rejected request rather than a broken database. The
 * previous ruleset id is printed first, and re-releasing it is the rollback.
 *
 *   node scripts/deploy-firestore-rules.cjs            # show the diff, publish nothing
 *   node scripts/deploy-firestore-rules.cjs --publish  # publish
 *   node scripts/deploy-firestore-rules.cjs --rollback projects/x/rulesets/ID
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_B64 from .env.local, so run it from the repo
 * root. The service account needs firebaserules access on the project.
 *
 * Run `npm run test:rules` before publishing. It needs no credentials and no
 * network, and it is the only thing that tells you whether the rules do what
 * you think.
 */

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const PUBLISH = process.argv.includes("--publish");
const ROLLBACK_IDX = process.argv.indexOf("--rollback");
const ROLLBACK_TO = ROLLBACK_IDX > -1 ? process.argv[ROLLBACK_IDX + 1] : null;

function credentials() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("No .env.local here. Run this from the repository root.");
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_B64="));
  if (!line) throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not in .env.local.");
  return JSON.parse(Buffer.from(line.slice("FIREBASE_SERVICE_ACCOUNT_B64=".length).trim(), "base64").toString("utf8"));
}

const norm = (s) => String(s || "").replace(/\r\n/g, "\n").trim();

(async () => {
  const creds = credentials();
  const project = creds.project_id;
  const local = fs.readFileSync("firestore.rules", "utf8");

  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/firebase"] });
  const client = await auth.getClient();
  const base = "https://firebaserules.googleapis.com/v1";

  const release = await client.request({ url: `${base}/projects/${project}/releases/cloud.firestore` });
  const liveName = release.data.rulesetName;
  const live = await client.request({ url: `${base}/${liveName}` });
  const deployed = norm(live.data.source.files[0].content);

  console.log(`project      : ${project}`);
  console.log(`live ruleset : ${liveName.split("/").pop()}`);
  console.log(`identical    : ${deployed === norm(local)}`);

  if (ROLLBACK_TO) {
    await client.request({
      url: `${base}/projects/${project}/releases/cloud.firestore`,
      method: "PATCH",
      data: { release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: ROLLBACK_TO } },
    });
    console.log(`\nrolled back to ${ROLLBACK_TO}`);
    process.exit(0);
  }

  if (deployed === norm(local)) {
    console.log("\nNothing to do.");
    process.exit(0);
  }

  // A crude but useful diff: which collections each side mentions.
  const collections = (src) => [...new Set((src.match(/match \/[A-Za-z{}=*/]+/g) || []))].sort();
  const before = collections(deployed);
  const after = collections(local);
  const added = after.filter((c) => !before.includes(c));
  const removed = before.filter((c) => !after.includes(c));
  if (added.length) console.log(`\nrules added for   : ${added.join(", ")}`);
  if (removed.length) console.log(`rules REMOVED for : ${removed.join(", ")}`);
  console.log(`\nsize: ${deployed.length} deployed vs ${norm(local).length} local`);

  if (!PUBLISH) {
    console.log("\nDry run. Re-run with --publish to release.");
    console.log(`Rollback target if you do: ${liveName}`);
    process.exit(0);
  }

  const created = await client.request({
    url: `${base}/projects/${project}/rulesets`,
    method: "POST",
    data: { source: { files: [{ name: "firestore.rules", content: local }] } },
  });
  await client.request({
    url: `${base}/projects/${project}/releases/cloud.firestore`,
    method: "PATCH",
    data: { release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: created.data.name } },
  });

  // Read back rather than trusting the write.
  const after2 = await client.request({ url: `${base}/projects/${project}/releases/cloud.firestore` });
  const check = await client.request({ url: `${base}/${after2.data.rulesetName}` });
  const ok = norm(check.data.source.files[0].content) === norm(local);

  console.log(`\npublished    : ${after2.data.rulesetName.split("/").pop()}`);
  console.log(`verified     : ${ok}`);
  console.log(`rollback     : node scripts/deploy-firestore-rules.cjs --rollback ${liveName}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
