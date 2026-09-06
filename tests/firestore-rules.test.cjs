#!/usr/bin/env node
/*
 * Firestore security-rules test suite for MADBOT.
 * Run with:  npm run test:rules
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------
 * It takes the real `firestore.rules` from the repo root and asks a rules
 * engine — not a re-implementation of one — whether a given request would be
 * allowed. Nothing is written to the production database, no Firebase Auth
 * account is created, and no token is minted. Every case is a triple of
 * (path, method, auth state) plus an expected verdict.
 *
 * The matrix covers four things:
 *
 *   1. Ownership isolation.  userA may touch its own /users/userA subtree and
 *      must be refused on /users/userB, for get / list / create / update /
 *      delete, on the user document, the site document, and all nine site
 *      subcollections.
 *   2. Unauthenticated access.  Every one of those paths must refuse a request
 *      with no auth at all, for all five methods.
 *   3. Privilege escalation.  The rules that stop a signed-in customer from
 *      granting themselves things: the `subscription` field on the user doc,
 *      the metered `usage` counters, `billing`, `billingEvents`, the OAuth
 *      token in `integrations`, the one-trial-per-person `trialLedger`, and
 *      the `mail` / `suppressions` collections.
 *   4. Deny by default.  Paths no rule mentions must be refused.
 *
 * ---------------------------------------------------------------------------
 * TWO ENGINES, AND WHY
 * ---------------------------------------------------------------------------
 * ENGINE "api" — Google's Security Rules TestRuleset API
 *   (POST https://firebaserules.googleapis.com/v1/projects/{p}:test).
 *   Evaluates rules server-side against synthetic requests. Touches no
 *   documents and needs no auth accounts. This is the only engine that can
 *   evaluate an *authenticated* case, because it lets you state
 *   `auth: { uid: "userA" }` directly instead of producing a credential.
 *
 *   It requires the calling principal to hold the IAM permission
 *   `firebaserules.rulesets.test` on the project. The service account in
 *   .env.local does NOT have it today — the API answers 403 IAM_PERMISSION_
 *   DENIED. To enable the full suite, grant that service account
 *   `roles/firebaserules.firebaseRulesViewer` plus rules-test access (the
 *   simplest working grant is `roles/firebaserules.admin`, or add
 *   `firebaserules.rulesets.test` to a custom role), then re-run.
 *
 * ENGINE "emulator" — the local Firestore emulator, driven with NO credential.
 *   Falls back to this automatically when the API is unavailable. The current
 *   firestore.rules is pushed into the emulator and each case is issued as a
 *   real, completely unauthenticated REST call; a 403 PERMISSION_DENIED means
 *   the rules refused it. Requires `firebase-tools` and a JRE, or an already
 *   running emulator named by FIRESTORE_EMULATOR_HOST.
 *
 *   This engine can only run the cases that have no auth — i.e. groups 2 and 4
 *   above, and the unauthenticated half of group 3. Producing an
 *   *authenticated* emulator request would mean fabricating a token, which
 *   this suite deliberately does not do. Authenticated cases are reported as
 *   NOT-RUN rather than guessed at, and the process still exits non-zero,
 *   because a suite that cannot distinguish allow from deny for its most
 *   important cases has not passed.
 *
 * Exit code: 0 only if every case ran and every case matched expectation.
 */

"use strict";

const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RULES_PATH = path.join(ROOT, "firestore.rules");
const RULES = fs.readFileSync(RULES_PATH, "utf8");
const D = "/databases/(default)/documents";

const SITE_SUBCOLLECTIONS = [
  "activity",
  "approvals",
  "leads",
  "content",
  "competitors",
  "jobs",
  "pages",
  "social",
  "listings",
];

const METHODS = ["get", "list", "create", "update", "delete"];

// ---------------------------------------------------------------------------
// Case construction
// ---------------------------------------------------------------------------
// A case is:
//   { group, label, uid|null, path, method, data?, existing?, expect }
// `path`     document path for get/create/update/delete, collection path for list
// `data`     the POST-WRITE document, i.e. what rules see as request.resource.data
// `existing` the document already in storage, i.e. what rules see as resource.data

const cases = [];
let seq = 0;
function add(c) {
  cases.push({ id: ++seq, ...c });
}

const P = {
  userDoc: (u) => `${D}/users/${u}`,
  userCol: () => `${D}/users`,
  site: (u) => `${D}/users/${u}/sites/s1`,
  siteCol: (u) => `${D}/users/${u}/sites`,
  sub: (u, s) => `${D}/users/${u}/sites/s1/${s}/x1`,
  subCol: (u, s) => `${D}/users/${u}/sites/s1/${s}`,
};

// --- Group 1: ownership isolation -----------------------------------------
// The user document itself. Not a uniform "own = allow": delete is nailed shut
// for everyone, and a list over /users cannot bind {uid} so it can never match.
add({ group: "ownership", label: "own user doc", uid: "userA", path: P.userDoc("userA"), method: "get", expect: "ALLOW" });
add({ group: "ownership", label: "other user doc", uid: "userA", path: P.userDoc("userB"), method: "get", expect: "DENY" });
add({ group: "ownership", label: "list /users collection", uid: "userA", path: P.userCol(), method: "list", expect: "DENY" });
add({
  group: "ownership",
  label: "create own user doc, no subscription",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "create",
  data: { displayName: "A", email: "a@example.com" },
  expect: "ALLOW",
});
add({
  group: "ownership",
  label: "create other user doc",
  uid: "userA",
  path: P.userDoc("userB"),
  method: "create",
  data: { displayName: "B" },
  expect: "DENY",
});
add({
  group: "ownership",
  label: "update own user doc, ordinary field",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A", email: "a@example.com" },
  data: { displayName: "A2", email: "a@example.com" },
  expect: "ALLOW",
});
add({
  group: "ownership",
  label: "update other user doc",
  uid: "userA",
  path: P.userDoc("userB"),
  method: "update",
  existing: { displayName: "B" },
  data: { displayName: "pwned" },
  expect: "DENY",
});
add({ group: "ownership", label: "delete own user doc", uid: "userA", path: P.userDoc("userA"), method: "delete", expect: "DENY" });
add({ group: "ownership", label: "delete other user doc", uid: "userA", path: P.userDoc("userB"), method: "delete", expect: "DENY" });

// The site document and every site subcollection: uniform owner-full-access.
const ownedTargets = [
  { label: "site doc", doc: (u) => P.site(u), col: (u) => P.siteCol(u) },
  ...SITE_SUBCOLLECTIONS.map((s) => ({
    label: `sites/s1/${s}`,
    doc: (u) => P.sub(u, s),
    col: (u) => P.subCol(u, s),
  })),
];

for (const t of ownedTargets) {
  for (const method of METHODS) {
    const isList = method === "list";
    add({
      group: "ownership",
      label: `own ${t.label}`,
      uid: "userA",
      path: isList ? t.col("userA") : t.doc("userA"),
      method,
      existing: { field: "before" },
      data: { field: "after" },
      expect: "ALLOW",
    });
    add({
      group: "ownership",
      label: `userB's ${t.label}`,
      uid: "userA",
      path: isList ? t.col("userB") : t.doc("userB"),
      method,
      existing: { field: "before" },
      data: { field: "after" },
      expect: "DENY",
    });
  }
}

// --- Group 2: unauthenticated --------------------------------------------
const unauthTargets = [
  { label: "user doc", doc: () => P.userDoc("userA"), col: () => P.userCol() },
  ...ownedTargets,
];
for (const t of unauthTargets) {
  for (const method of METHODS) {
    const isList = method === "list";
    add({
      group: "unauth",
      label: `unauthenticated ${t.label}`,
      uid: null,
      path: isList ? t.col("userA") : t.doc("userA"),
      method,
      existing: { field: "before" },
      data: { field: "after" },
      expect: "DENY",
    });
  }
}

// --- Group 3: privilege escalation ---------------------------------------

// 3a. The subscription field on the user document. This is the one that decides
// what the customer is entitled to (lib/licenseServer.js reads users/{uid}
// .subscription and nothing else), so a client that can write it can grant
// itself the top plan.
add({
  group: "escalation",
  label: "create user doc carrying a subscription",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "create",
  data: { displayName: "A", subscription: { plan: "agency", status: "active" } },
  expect: "DENY",
});
add({
  group: "escalation",
  label: "update user doc, escalate subscription.plan",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A", subscription: { plan: "free", status: "trialing" } },
  data: { displayName: "A", subscription: { plan: "agency", status: "active" } },
  expect: "DENY",
});
add({
  group: "escalation",
  label: "update user doc, add subscription where there was none",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A" },
  data: { displayName: "A", subscription: { plan: "agency" } },
  expect: "DENY",
});
add({
  group: "escalation",
  label: "update user doc, remove subscription entirely",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A", subscription: { plan: "free" } },
  data: { displayName: "A" },
  expect: "DENY",
});
add({
  group: "escalation",
  label: "update user doc, subscription smuggled alongside displayName",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A", subscription: { plan: "free" } },
  data: { displayName: "A2", subscription: { plan: "agency" } },
  expect: "DENY",
});
add({
  group: "escalation",
  label: "update user doc, displayName only (control: must still work)",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "update",
  existing: { displayName: "A", subscription: { plan: "free" } },
  data: { displayName: "A2", subscription: { plan: "free" } },
  expect: "ALLOW",
});

// 3b. Server-only subtrees. `read` covers get and list; `write` covers create,
// update and delete. Each is spelled out so a failure names the exact method.
const serverOnly = [
  {
    label: "usage counters",
    doc: (u) => `${D}/users/${u}/sites/s1/usage/2026-09`,
    col: (u) => `${D}/users/${u}/sites/s1/usage`,
    ownerRead: "ALLOW",
    ownerWrite: "DENY",
  },
  {
    label: "billing history",
    doc: (u) => `${D}/users/${u}/billing/e1`,
    col: (u) => `${D}/users/${u}/billing`,
    ownerRead: "ALLOW",
    ownerWrite: "DENY",
  },
  {
    label: "billingEvents log",
    doc: (u) => `${D}/users/${u}/billingEvents/e1`,
    col: (u) => `${D}/users/${u}/billingEvents`,
    ownerRead: "DENY",
    ownerWrite: "DENY",
  },
  {
    label: "github integration token",
    doc: (u) => `${D}/users/${u}/sites/s1/integrations/github`,
    col: (u) => `${D}/users/${u}/sites/s1/integrations`,
    ownerRead: "DENY",
    ownerWrite: "DENY",
  },
];

for (const t of serverOnly) {
  for (const method of METHODS) {
    const isList = method === "list";
    const isRead = method === "get" || method === "list";
    add({
      group: "escalation",
      label: `owner ${method} ${t.label}`,
      uid: "userA",
      path: isList ? t.col("userA") : t.doc("userA"),
      method,
      existing: { credits: 1 },
      data: { credits: 0 },
      expect: isRead ? t.ownerRead : t.ownerWrite,
    });
    add({
      group: "escalation",
      label: `cross-user ${method} ${t.label}`,
      uid: "userA",
      path: isList ? t.col("userB") : t.doc("userB"),
      method,
      existing: { credits: 1 },
      data: { credits: 0 },
      expect: "DENY",
    });
    add({
      group: "unauth",
      label: `unauthenticated ${method} ${t.label}`,
      uid: null,
      path: isList ? t.col("userA") : t.doc("userA"),
      method,
      existing: { credits: 1 },
      data: { credits: 0 },
      expect: "DENY",
    });
  }
}

// 3c. Top-level server-only collections. Nobody gets these, ever.
const topLevelServerOnly = [
  { label: "trialLedger", doc: `${D}/trialLedger/f00dbabe`, col: `${D}/trialLedger` },
  { label: "mail", doc: `${D}/mail/msg1`, col: `${D}/mail` },
  { label: "suppressions", doc: `${D}/suppressions/a%40example.com`, col: `${D}/suppressions` },
];
for (const t of topLevelServerOnly) {
  for (const method of METHODS) {
    const isList = method === "list";
    for (const uid of ["userA", null]) {
      add({
        group: uid ? "escalation" : "unauth",
        label: `${uid ? "signed-in" : "unauthenticated"} ${method} ${t.label}`,
        uid,
        path: isList ? t.col : t.doc,
        method,
        existing: { x: 1 },
        data: { x: 2 },
        expect: "DENY",
      });
    }
  }
}

// 3d. Documented-on-purpose grant: the customer really does own its social
// posts and may flip status to "approved" locally. Asserted so that if someone
// later locks this down, the comment in firestore.rules and the behaviour of
// /api/social/publish stop agreeing silently.
add({
  group: "escalation",
  label: "owner marks own social post approved (documented as harmless)",
  uid: "userA",
  path: `${D}/users/userA/sites/s1/social/p1`,
  method: "update",
  existing: { status: "draft" },
  data: { status: "approved" },
  expect: "ALLOW",
});

// --- Group 4: deny by default --------------------------------------------
const unmatched = [
  `${D}/randomCollection/x`,
  `${D}/config/global`,
  `${D}/users/userA/secretStuff/y`,
  `${D}/users/userA/sites/s1/unknownSub/z`,
  `${D}/users/userA/sites/s1/integrations/github/nested/deeper`,
  `${D}/admin/flags`,
];
for (const p of unmatched) {
  for (const uid of ["userA", null]) {
    for (const method of ["get", "create", "update", "delete"]) {
      add({
        group: uid ? "default-deny" : "unauth",
        label: `${uid ? "signed-in" : "unauthenticated"} ${method} unmatched path`,
        uid,
        path: p,
        method,
        existing: { a: 1 },
        data: { a: 2 },
        expect: "DENY",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Engine 1: TestRuleset API
// ---------------------------------------------------------------------------

function readServiceAccount() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return null;
  const prefix = "FIREBASE_SERVICE_ACCOUNT_B64=";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(prefix));
  if (!line) return null;
  try {
    return JSON.parse(Buffer.from(line.slice(prefix.length).trim(), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function toApiCase(c) {
  const request = {
    path: c.path,
    method: c.method,
  };
  if (c.uid) request.auth = { uid: c.uid };
  if (c.method === "create" || c.method === "update") {
    request.resource = { data: c.data || {} };
  }
  const tc = { expectation: c.expect, request };
  // `resource` (top level) is the document already in storage. The user-doc
  // update rule calls resource.data via diff(), so it must be supplied or the
  // case cannot be evaluated.
  if (c.method === "update" || c.method === "delete") {
    tc.resource = { data: c.existing || {} };
  }
  return tc;
}

async function runApiEngine(log) {
  let GoogleAuth;
  try {
    ({ GoogleAuth } = require("google-auth-library"));
  } catch {
    return { available: false, reason: "google-auth-library is not installed" };
  }
  const creds = readServiceAccount();
  if (!creds) {
    return { available: false, reason: "FIREBASE_SERVICE_ACCOUNT_B64 missing or unparseable in .env.local" };
  }

  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const url = `https://firebaserules.googleapis.com/v1/projects/${creds.project_id}:test`;

  const results = new Map();
  const BATCH = 100;
  for (let i = 0; i < cases.length; i += BATCH) {
    const chunk = cases.slice(i, i + BATCH);
    let res;
    try {
      res = await client.request({
        url,
        method: "POST",
        data: {
          source: { files: [{ name: "firestore.rules", content: RULES }] },
          testSuite: { testCases: chunk.map(toApiCase) },
        },
      });
    } catch (err) {
      const body = err.response && err.response.data;
      const status = body && body.error && body.error.status;
      const perm =
        body &&
        body.error &&
        body.error.details &&
        body.error.details[0] &&
        body.error.details[0].metadata &&
        body.error.details[0].metadata.permission;
      if (status === "PERMISSION_DENIED") {
        return {
          available: false,
          reason:
            `the TestRuleset API refused the service account (403 PERMISSION_DENIED` +
            (perm ? `, missing "${perm}"` : "") + `)`,
        };
      }
      log(`\n  TestRuleset API error, full body:\n${JSON.stringify(body || err.message, null, 2)}\n`);
      return { available: false, reason: `TestRuleset API error: ${status || err.message}` };
    }

    const issues = res.data.issues || [];
    if (issues.length) {
      log("  rules compile issues reported by the API:");
      for (const is of issues) log(`    ${is.severity} ${is.description}`);
    }
    const testResults = res.data.testResults || [];
    chunk.forEach((c, idx) => {
      const r = testResults[idx];
      if (!r) {
        results.set(c.id, { verdict: null, note: "no result returned for this case" });
        return;
      }
      // state SUCCESS means the engine agreed with `expectation`.
      const matched = r.state === "SUCCESS";
      const verdict = matched ? c.expect : c.expect === "ALLOW" ? "DENY" : "ALLOW";
      const errs = (r.errors || []).map((e) => e.description).filter(Boolean);
      results.set(c.id, { verdict, note: errs.join("; ") || null });
    });
  }
  return { available: true, results };
}

// ---------------------------------------------------------------------------
// Engine 2: local Firestore emulator, unauthenticated requests only
// ---------------------------------------------------------------------------

const EMU_PROJECT = "madbot-rules-test";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function reachable(hostport, ms = 1500) {
  try {
    const r = await fetch(`http://${hostport}/`, { signal: AbortSignal.timeout(ms) });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

function haveFirebaseTools() {
  const r = spawnSync("firebase", ["--version"], { shell: true, encoding: "utf8", timeout: 60000 });
  return r.status === 0;
}

async function startEmulator(log) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "madbot-rules-"));
  fs.writeFileSync(path.join(dir, "firestore.rules"), RULES);
  fs.writeFileSync(
    path.join(dir, "firebase.json"),
    JSON.stringify({
      firestore: { rules: "firestore.rules" },
      emulators: { firestore: { host: "127.0.0.1", port }, ui: { enabled: false } },
    })
  );
  const logFile = path.join(dir, "emulator.log");
  const out = fs.openSync(logFile, "a");
  log(`  starting a Firestore emulator on 127.0.0.1:${port} (log: ${logFile})`);
  const child = spawn("firebase", ["emulators:start", "--only", "firestore", "--project", EMU_PROJECT], {
    cwd: dir,
    shell: true,
    stdio: ["ignore", out, out],
    detached: false,
  });
  const hostport = `127.0.0.1:${port}`;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await reachable(hostport)) {
      return { hostport, stop: () => stopEmulator(child) };
    }
    if (child.exitCode !== null) {
      log(`  emulator exited early; see ${logFile}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopEmulator(child);
  log(`  emulator did not become ready within 180s; see ${logFile}`);
  return null;
}

function stopEmulator(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    // The `firebase` wrapper spawns a Java child; kill the whole tree.
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function pushRules(hostport) {
  const res = await fetch(`http://${hostport}/emulator/v1/projects/${EMU_PROJECT}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: RULES }] } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`could not load rules into the emulator: ${res.status} ${await res.text()}`);
}

function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj || {})) f[k] = toValue(v);
  return f;
}

// Turns a case into a real REST call. Only ever used for cases with uid === null,
// so no Authorization header is ever produced.
function toRestCall(c, hostport) {
  const base = `http://${hostport}/v1/projects/${EMU_PROJECT}`;
  const full = `${base}${c.path.replace("/databases/(default)/documents", "/databases/(default)/documents")}`;
  switch (c.method) {
    case "get":
    case "list":
      return { method: "GET", url: full, body: null };
    case "create": {
      const i = c.path.lastIndexOf("/");
      const parent = c.path.slice(0, i);
      const docId = c.path.slice(i + 1);
      return {
        method: "POST",
        url: `${base}${parent}?documentId=${encodeURIComponent(docId)}`,
        body: { fields: toFields(c.data) },
      };
    }
    case "update":
      return { method: "PATCH", url: full, body: { fields: toFields(c.data) } };
    case "delete":
      return { method: "DELETE", url: full, body: null };
    default:
      throw new Error(`unhandled method ${c.method}`);
  }
}

async function runEmulatorEngine(log) {
  let hostport = process.env.FIRESTORE_EMULATOR_HOST || null;
  let stop = () => {};
  if (hostport && !(await reachable(hostport))) hostport = null;
  if (!hostport) {
    if (!haveFirebaseTools()) {
      return { available: false, reason: "firebase-tools is not on PATH and FIRESTORE_EMULATOR_HOST is not set" };
    }
    const started = await startEmulator(log);
    if (!started) return { available: false, reason: "the Firestore emulator would not start" };
    hostport = started.hostport;
    stop = started.stop;
  } else {
    log(`  using the emulator already running at ${hostport}`);
  }

  try {
    await pushRules(hostport);
    const results = new Map();
    for (const c of cases) {
      if (c.uid) {
        results.set(c.id, {
          verdict: null,
          note: "not run: an authenticated case cannot be evaluated without fabricating a token",
        });
        continue;
      }
      const call = toRestCall(c, hostport);
      let status, text;
      try {
        const r = await fetch(call.url, {
          method: call.method,
          headers: call.body ? { "Content-Type": "application/json" } : {},
          body: call.body ? JSON.stringify(call.body) : undefined,
          signal: AbortSignal.timeout(20000),
        });
        status = r.status;
        text = await r.text();
      } catch (err) {
        results.set(c.id, { verdict: null, note: `not run: request failed (${err.message})` });
        continue;
      }
      if (status === 403 && /PERMISSION_DENIED/.test(text)) {
        results.set(c.id, { verdict: "DENY", note: null });
      } else if (status === 200 || status === 404) {
        // 404 = the rules let the read through and the document simply is not there.
        results.set(c.id, { verdict: "ALLOW", note: `HTTP ${status}` });
      } else {
        results.set(c.id, {
          verdict: null,
          note: `inconclusive: HTTP ${status} ${text.slice(0, 200).replace(/\s+/g, " ")}`,
        });
      }
    }
    return { available: true, results };
  } finally {
    stop();
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function authLabel(c) {
  return c.uid ? `auth=${c.uid}` : "auth=none";
}

async function main() {
  const log = (s) => process.stdout.write(`${s}\n`);

  log("Firestore security-rules test suite");
  log(`  rules:  ${RULES_PATH}`);
  log(`  cases:  ${cases.length}`);
  log("");

  log("Engine: TestRuleset API (firebaserules.googleapis.com)");
  let engineName = "TestRuleset API";
  let run = await runApiEngine(log);
  if (!run.available) {
    log(`  UNAVAILABLE: ${run.reason}`);
    log("  Falling back to the local emulator, which can only evaluate the");
    log("  unauthenticated cases. Authenticated cases will be reported NOT-RUN.");
    log("");
    log("Engine: local Firestore emulator (no credential, no token)");
    engineName = "local emulator (unauthenticated cases only)";
    run = await runEmulatorEngine(log);
    if (!run.available) {
      log(`  UNAVAILABLE: ${run.reason}`);
      log("");
      log("FATAL: no rules engine available, so nothing was proved. Exiting non-zero.");
      process.exit(2);
    }
  }
  log("");

  const groups = ["ownership", "unauth", "escalation", "default-deny"];
  const titles = {
    ownership: "Ownership isolation",
    unauth: "Unauthenticated access",
    escalation: "Privilege escalation",
    "default-deny": "Deny by default",
  };

  let pass = 0;
  const failures = [];
  const notRun = [];

  for (const g of groups) {
    const inGroup = cases.filter((c) => c.group === g);
    if (!inGroup.length) continue;
    log(`--- ${titles[g]} (${inGroup.length} cases) ---`);
    for (const c of inGroup) {
      const r = run.results.get(c.id) || { verdict: null, note: "no result" };
      const where = `${c.path.replace(D, "")} ${c.method} ${authLabel(c)}`;
      if (r.verdict === null) {
        notRun.push({ c, r, where });
        log(`  NOT-RUN  #${String(c.id).padStart(3)}  ${where}  [${c.label}]  ${r.note || ""}`);
      } else if (r.verdict === c.expect) {
        pass++;
        log(`  PASS     #${String(c.id).padStart(3)}  ${where}  -> ${r.verdict}  [${c.label}]`);
      } else {
        failures.push({ c, r, where });
        log(
          `  FAIL     #${String(c.id).padStart(3)}  ${where}  expected ${c.expect}, rules said ${r.verdict}  [${c.label}]` +
            (r.note ? `  ${r.note}` : "")
        );
      }
    }
    log("");
  }

  log("=".repeat(72));
  log(`Engine used : ${engineName}`);
  log(`Total cases : ${cases.length}`);
  log(`Passed      : ${pass}`);
  log(`Failed      : ${failures.length}`);
  log(`Not run     : ${notRun.length}`);
  log("=".repeat(72));

  if (failures.length) {
    log("");
    log("FAILURES");
    for (const f of failures) {
      log(`  ${f.where}`);
      log(`    expected ${f.c.expect}, rules said ${f.r.verdict}   (${f.c.label})`);
      if (f.r.note) log(`    ${f.r.note}`);
    }
  }

  if (notRun.length) {
    log("");
    log(`${notRun.length} case(s) could not be evaluated by this engine. A case that cannot`);
    log("distinguish allow from deny is not a pass, so this run does not certify the");
    log("rules. See the header comment for the IAM grant that enables the full suite.");
  }

  process.exit(failures.length || notRun.length ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`\nunexpected error: ${err && err.stack ? err.stack : err}\n`);
  process.exit(3);
});
