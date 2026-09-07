/**
 * Removes the fabricated approvals that an older version of the signup seed
 * wrote into real accounts.
 *
 * Three of them were created per account on 22 and 23 August 2026: a guest post
 * pitch, a directory listing and a competitor comparison page. The current code
 * does not create them, and MADBOT has no guest-post feature at all, so nothing
 * will produce them again. The records themselves are still in Firestore, and
 * they show up on the Approvals screen looking like work the product did.
 *
 * They are identifiable without guessing, and this script insists on all five
 * signals before it will touch anything:
 *
 *   1. the title is one of the three seeded strings
 *   2. status is already "yes", so nobody ever approved it: it was born decided
 *   3. no `subject`  — every real outreach approval has one
 *   4. no `to`       — likewise
 *   5. no `provenance` — likewise
 *
 * A genuine approval fails at least three of those, so this cannot delete real
 * work even if somebody happens to write an approval with the same title.
 *
 * DRY RUN BY DEFAULT.
 *
 *   node scripts/prune-seeded-approvals.cjs              # report only
 *   node scripts/prune-seeded-approvals.cjs --confirm    # delete
 *
 * Run from the repository root. Deletion is irreversible.
 */

const fs = require("fs");
const path = require("path");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const CONFIRM = process.argv.includes("--confirm");

const SEEDED_TITLES = new Set([
  "Guest post pitch to a relevant publication",
  "Listing on a relevant directory",
  "Comparison page against a competitor",
]);

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

/** All five signals, or it is left alone. */
function isSeeded(v) {
  return (
    SEEDED_TITLES.has(v.title) &&
    v.status === "yes" &&
    !v.subject &&
    !v.to &&
    !v.provenance
  );
}

(async () => {
  const creds = credentials();
  initializeApp({
    credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key,
    }),
  });
  const db = getFirestore();

  console.log(`project: ${creds.project_id}`);
  console.log(CONFIRM ? "mode: DELETE\n" : "mode: dry run, nothing will be deleted\n");

  const doomed = [];
  let kept = 0;
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    // eslint-disable-next-line no-await-in-loop
    const sites = await u.ref.collection("sites").get();
    for (const s of sites.docs) {
      // eslint-disable-next-line no-await-in-loop
      const approvals = await s.ref.collection("approvals").get();
      approvals.forEach((a) => {
        const v = a.data() || {};
        if (isSeeded(v)) doomed.push({ ref: a.ref, site: s.data()?.url || s.id, title: v.title });
        else kept += 1;
      });
    }
  }

  console.log(`seeded approvals found : ${doomed.length}`);
  console.log(`real approvals untouched: ${kept}\n`);

  if (!doomed.length) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  for (const d of doomed) console.log(`  ${CONFIRM ? "delete " : "would delete "}${d.site}  "${d.title}"`);

  if (!CONFIRM) {
    console.log(`\nDry run. Re-run with --confirm to delete ${doomed.length}. This cannot be undone.`);
    process.exit(0);
  }

  let done = 0;
  for (const d of doomed) {
    // eslint-disable-next-line no-await-in-loop
    await d.ref.delete();
    done += 1;
  }
  console.log(`\nDeleted ${done}. Left ${kept} real approvals alone.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
