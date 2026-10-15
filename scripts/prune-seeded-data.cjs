/**
 * Removes the fabricated records that early versions of the signup seed wrote
 * into real accounts on 22 and 23 August 2026 (commits 7400e6b to 1de44ba,
 * removed in 43241ce). It covers all four kinds the seed wrote, and replaces
 * scripts/prune-seeded-approvals.cjs, which covered only approvals and, by
 * requiring status "yes", skipped every one still pending.
 *
 *   leads      six invented companies ("Northwind Logistics", "Bramble Health",
 *              "Kestrel Payments", "Fen & Co", "Ardent Labs", "Solstice
 *              Retail") with invented staff counts and fit scores
 *   content    an invented weekly calendar ("…: the definitive guide",
 *              "Guest post pitch", "Friday digest to you", …)
 *   activity   claims of work never done ("Fixed missing meta descriptions and
 *              orphan pages", "Listed … in a few relevant directories", …)
 *   approvals  three pending decisions about work that didn't exist
 *
 * Each matcher needs the seed's text AND a structural mark no real record has,
 * so a real record that happens to share a title is never touched:
 *
 *   leads      seeded company and seeded reason, and no `domain` (every lead
 *              the product finds has one)
 *   content    a `dayName` field (the seed's calendar shape; real pieces have
 *              none) and a seeded title
 *   activity   an `m` minute-offset field (only the seed wrote one) and one of
 *              the four invented claims. "Read {domain} and mapped growth
 *              opportunities" is left alone: the fetch it describes happened.
 *   approvals  a seeded title, the seed's `forecast` and `conf` fields, and none
 *              of the subject, recipient or provenance real approvals carry
 *
 * The matchers are exported and tested in tests/seedPrune.test.mjs against
 * records built from the historical seed code.
 *
 * DRY RUN BY DEFAULT.
 *
 *   node scripts/prune-seeded-data.cjs              # report only
 *   node scripts/prune-seeded-data.cjs --confirm    # delete
 *
 * Run from the repository root. Deletion is irreversible.
 */

const fs = require("fs");
const path = require("path");

const SEEDED_COMPANIES = new Map([
  ["Northwind Logistics", "A public signal matching your ideal customer profile appeared this week"],
  ["Bramble Health", "Hiring for a role that suggests they have your problem"],
  ["Kestrel Payments", "Asked a question you solve in a public community"],
  ["Fen & Co", "Two matching signals in the same week"],
  ["Ardent Labs", "Left a competitor a one-star review"],
  ["Solstice Retail", "Public status/news suggests they need this now"],
]);

const SEEDED_CONTENT_EXACT = new Set([
  "A vs. B, plainly",
  "Glossary: 8 terms",
  "What breaks without this",
  "Guest post pitch",
  "Friday digest to you",
  "Refresh: stale posts",
]);
const SEEDED_CONTENT_PATTERNS = [/: the definitive guide$/, / vs\. a competitor$/];

const SEEDED_ACTIVITY = [
  /^Drafted ".*: the definitive guide" — first pillar page$/,
  /^Fixed missing meta descriptions and orphan pages$/,
  /^Listed .+ in a few relevant directories$/,
  /^Scored companies matching your ideal customer profile$/,
];

const SEEDED_APPROVALS = new Set([
  "Guest post pitch to a relevant publication",
  "Listing on a relevant directory",
  "Comparison page against a competitor",
]);

function isSeededLead(v) {
  return SEEDED_COMPANIES.get(v?.co) === v?.why && !v?.domain;
}

function isSeededContent(v) {
  const t = String(v?.title || "");
  return typeof v?.dayName === "string" && (SEEDED_CONTENT_EXACT.has(t) || SEEDED_CONTENT_PATTERNS.some((re) => re.test(t)));
}

function isSeededActivity(v) {
  return typeof v?.m === "number" && SEEDED_ACTIVITY.some((re) => re.test(String(v?.text || "")));
}

// Any status. The older script required status "yes", but every version of the
// seed wrote these as "pending" (lib/sites.js addApproval, 7400e6b to 1de44ba),
// so it skipped exactly the ones still sitting in someone's queue. The seed's
// own `forecast` and `conf` fields are the mark instead: the only real
// approvals the product creates are outreach drafts, which carry a subject and
// a recipient and never those fields.
function isSeededApproval(v) {
  return (
    SEEDED_APPROVALS.has(v?.title) &&
    typeof v?.forecast === "string" &&
    typeof v?.conf === "string" &&
    !v?.subject &&
    !v?.to &&
    !v?.provenance
  );
}

const KINDS = [
  { collection: "leads", match: isSeededLead, label: (v) => v.co },
  { collection: "content", match: isSeededContent, label: (v) => v.title },
  { collection: "activity", match: isSeededActivity, label: (v) => v.text },
  { collection: "approvals", match: isSeededApproval, label: (v) => v.title },
];

module.exports = { isSeededLead, isSeededContent, isSeededActivity, isSeededApproval };

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

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const { cert, initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");

  const creds = credentials();
  initializeApp({
    credential: cert({ projectId: creds.project_id, clientEmail: creds.client_email, privateKey: creds.private_key }),
  });
  const db = getFirestore();

  console.log(`project: ${creds.project_id}`);
  console.log(CONFIRM ? "mode: DELETE\n" : "mode: dry run, nothing will be deleted\n");

  const doomed = [];
  const kept = Object.fromEntries(KINDS.map((k) => [k.collection, 0]));
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    // eslint-disable-next-line no-await-in-loop
    const sites = await u.ref.collection("sites").get();
    for (const s of sites.docs) {
      for (const kind of KINDS) {
        // eslint-disable-next-line no-await-in-loop
        const snap = await s.ref.collection(kind.collection).get();
        snap.forEach((d) => {
          const v = d.data() || {};
          if (kind.match(v)) doomed.push({ ref: d.ref, kind: kind.collection, site: s.data()?.url || s.id, label: kind.label(v) });
          else kept[kind.collection] += 1;
        });
      }
    }
  }

  for (const kind of KINDS) {
    const n = doomed.filter((d) => d.kind === kind.collection).length;
    console.log(`${kind.collection.padEnd(10)} seeded: ${String(n).padStart(4)}   real, untouched: ${kept[kind.collection]}`);
  }
  console.log("");

  if (!doomed.length) {
    console.log("Nothing to do.");
    return;
  }
  for (const d of doomed) console.log(`  ${CONFIRM ? "delete " : "would delete "}[${d.kind}] ${d.site}  "${d.label}"`);

  if (!CONFIRM) {
    console.log(`\nDry run. Re-run with --confirm to delete ${doomed.length}. This cannot be undone.`);
    return;
  }

  let done = 0;
  for (const d of doomed) {
    // eslint-disable-next-line no-await-in-loop
    await d.ref.delete();
    done += 1;
  }
  console.log(`\nDeleted ${done}. Every other record was left alone.`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("FAILED:", e.message);
      process.exit(1);
    });
}
