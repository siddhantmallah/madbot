/**
 * Deletes Firestore user documents whose Firebase Auth account no longer
 * exists.
 *
 * These accumulate from accounts deleted through the Firebase console rather
 * than through the product. The in-product delete route removes both the auth
 * account and the documents, so nothing created from here on should orphan;
 * this is for the backlog.
 *
 * It matters beyond tidiness. An orphaned document is personal data belonging
 * to somebody who no longer has an account, which is exactly what the storage
 * limitation principle is about, and the daily retention job only prunes leads
 * inside live accounts.
 *
 * DRY RUN BY DEFAULT. Nothing is deleted without --confirm.
 *
 *   node scripts/prune-orphan-users.cjs              # report only
 *   node scripts/prune-orphan-users.cjs --confirm    # actually delete
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_B64 from .env.local, so run it from the repo
 * root. Deletion is recursive and irreversible.
 */

const fs = require("fs");
const path = require("path");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const CONFIRM = process.argv.includes("--confirm");

function credentials() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("No .env.local here. Run this from the repository root.");
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_B64="));
  if (!line) throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not in .env.local.");
  const b64 = line.slice("FIREBASE_SERVICE_ACCOUNT_B64=".length).trim();
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function liveUids() {
  const uids = new Set();
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await getAuth().listUsers(1000, pageToken);
    page.users.forEach((u) => uids.add(u.uid));
    pageToken = page.pageToken;
  } while (pageToken);
  return uids;
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

  const live = await liveUids();
  const docs = await db.collection("users").get();

  const orphans = [];
  for (const d of docs.docs) {
    if (live.has(d.id)) continue;
    // eslint-disable-next-line no-await-in-loop
    const sites = await d.ref.collection("sites").count().get();
    const data = d.data() || {};
    orphans.push({
      ref: d.ref,
      uid: d.id,
      sites: sites.data().count,
      // A subscription record is the one thing that suggests this was a real
      // customer rather than a test account. Refuse to touch those.
      hasSubscription: !!data.subscription,
      email: data.email || null,
    });
  }

  console.log(`live auth accounts: ${live.size}`);
  console.log(`user documents:     ${docs.size}`);
  console.log(`orphaned:           ${orphans.length}\n`);

  if (!orphans.length) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  const keep = orphans.filter((o) => o.hasSubscription);
  const remove = orphans.filter((o) => !o.hasSubscription);

  for (const o of remove) {
    console.log(`  delete  ${o.uid}  sites=${o.sites}  ${o.email || "(no email on record)"}`);
  }
  for (const o of keep) {
    console.log(`  KEEP    ${o.uid}  has a subscription record, needs a human decision`);
  }

  if (!CONFIRM) {
    console.log(`\nDry run. ${remove.length} would be deleted, ${keep.length} kept.`);
    console.log("Re-run with --confirm to delete. This cannot be undone.");
    process.exit(0);
  }

  let done = 0;
  for (const o of remove) {
    // recursiveDelete walks every subcollection. A plain delete would leave
    // the sites, leads and drafts behind as unreachable documents.
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(o.ref);
    done += 1;
    console.log(`  deleted ${o.uid}  (${done}/${remove.length})`);
  }

  console.log(`\nDeleted ${done}. Kept ${keep.length} with subscription records.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
