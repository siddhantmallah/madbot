#!/usr/bin/env node
/*
 * Firestore security-rules test suite for MADBOT.
 * Run with:  npm run test:rules
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------
 * It takes the real `firestore.rules` from the repo root, loads it into a
 * throwaway local Firestore emulator, and issues every case as a real request
 * against a real rules engine — not a re-implementation of one. Every case is
 * a triple of (path, method, auth state) plus an expected verdict, and the
 * verdict is read off what the engine actually did.
 *
 * The matrix covers five things:
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
 *   5. Added coverage.  Arbitrary non-`subscription` fields on the user doc,
 *      cross-tenant creates, cross-user reads of the money and credential
 *      subtrees, trialLedger as a signed-in user, and the deliberate
 *      social-post "approved" grant.
 *
 * ---------------------------------------------------------------------------
 * HOW AUTHENTICATED CASES RUN (and why this is not a real credential)
 * ---------------------------------------------------------------------------
 * Nothing here touches the production project, no Firebase Auth account is
 * created, and no signed token is minted.
 *
 * The Firestore emulator does not verify token signatures — it decodes the JWT
 * payload and takes `sub` / `user_id` as the uid. So an authenticated request
 * is an `Authorization: Bearer <unsigned JWT>` where the JWT is
 *
 *     base64url({"alg":"none","kid":"fakekid","typ":"JWT"})
 *   . base64url({"iss":"https://securetoken.google.com/<project>",
 *                "aud":"<project>","sub":"userA","user_id":"userA", ...})
 *   . <empty>
 *
 * This is the same construction `@firebase/rules-unit-testing` uses, spelled
 * out here so the suite needs no extra dependency. Note the third segment must
 * be EMPTY — firebase-tools 14.x answers `400 invalid jwt` to a JWT carrying a
 * placeholder signature string, which is what made an earlier attempt at this
 * look impossible.
 *
 * Documents are seeded and torn down with `Authorization: Bearer owner`, the
 * emulator's documented admin bypass. Seeding is not a convenience: the rules
 * engine classifies a write as `create` or `update` from whether the document
 * exists, so an `update` case tested against an absent document would silently
 * be evaluating the `create` rule instead.
 *
 * ---------------------------------------------------------------------------
 * NEGATIVE CONTROLS, AND WHY THERE ARE FOUR
 * ---------------------------------------------------------------------------
 * Every verdict is read off an HTTP status, so the harness must first prove it
 * can observe each outcome. If it could not, a misconfigured emulator would
 * 403 everything and all 250-odd expect-DENY cases would "pass" while proving
 * nothing. Before any case runs, against throwaway rulesets:
 *
 *   1. ALLOW is observable       — an unauthenticated read of an open path
 *                                  must come back ALLOW.
 *   2. DENY is observable        — a read of a closed path must come back DENY.
 *   3. The uid actually binds    — under `allow if request.auth.uid == u`,
 *                                  uid=userA must be ALLOWed on /userA and
 *                                  DENIED on /userB, and no-auth DENIED on
 *                                  both. Without this, an ignored token would
 *                                  turn every cross-user case into a free pass.
 *   4. The admin bypass works,
 *      and a user token is not
 *      an admin token            — under all-deny rules, `Bearer owner` gets
 *                                  through and `Bearer <userA jwt>` does not.
 *                                  (1) and (2) are re-tested authenticated.
 *
 * If any control fails the run is abandoned rather than reported as a pass.
 *
 * ---------------------------------------------------------------------------
 * THE OTHER ENGINE (opt-in), AND WHY IT IS THE WEAKER ONE
 * ---------------------------------------------------------------------------
 * `RULES_ENGINE=api npm run test:rules` uses Google's Security Rules
 * TestRuleset API (POST https://firebaserules.googleapis.com/v1/projects/{p}
 * :test) instead. It evaluates a supplied ruleset against synthetic requests —
 * it reads no documents and signs in as nobody — and needs neither an emulator
 * nor a JRE. It requires the caller to hold `firebaserules.rulesets.test`; the
 * service account in .env.local now does.
 *
 * Run it and it agrees with the emulator on every case except `list`, where it
 * cannot model the question at all. Its `request.path` is matched against the
 * rules' `match` patterns, which always end in a document segment, so:
 *
 *   path shape                                  API verdict   emulator verdict
 *   /users/userA/sites        (collection)      DENY          ALLOW
 *   /users/userA/sites/s1     (document)        ALLOW          n/a (that's a get)
 *   /users                    (collection)      DENY          DENY
 *   /users/userA              (document)        ALLOW         DENY
 *
 * Given a collection path the API matches no rule and denies everything. Given
 * a document path it binds the wildcard — so `list /users/userA` comes back
 * ALLOW, which is flatly wrong: a real query over /users cannot bind {uid}, and
 * the emulator says so in as many words ("Null value error. for 'list' @ L10").
 * The API simply has no way to express an unconstrained collection query.
 *
 * So this engine reports every `list` case as NOT-RUN, which means it can never
 * certify the rules on its own. It is kept as an independent cross-check of the
 * other ~85%: two unrelated engines agreeing on every ownership and escalation
 * case is worth more than one engine agreeing with itself.
 *
 * Requirements for the default engine: `firebase-tools` on PATH and a JRE, or
 * an already-running emulator named by FIRESTORE_EMULATOR_HOST.
 *
 * Exit code: 0 only if every case ran and every case matched expectation.
 * A case that could not be evaluated is not a pass.
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
//
// `path`     A DOCUMENT path for get/create/update/delete. A COLLECTION path
//            for list — settled empirically for the emulator engine, which is
//            the authoritative one: `GET /v1/.../documents/users` is a
//            ListDocuments call and the engine reports it as method `list`
//            ("false for 'list' @ L10"), whereas a GET on /users/userA is
//            reported as `get`. Passing a document path for a list case would
//            silently test `get` instead.
//            The TestRuleset API wants the opposite shape (a document path)
//            and cannot express an unconstrained collection query at all, so
//            it declines list cases rather than answer them wrongly. See the
//            header.
// `data`     The POST-WRITE document, i.e. what rules see as
//            request.resource.data. Writes go out as a PATCH with no
//            updateMask, which is full-overwrite (`set()`) semantics —
//            verified: PATCHing {a:9} over {a:1,b:2} leaves {a:9}. That is
//            what makes "remove subscription entirely" a real test.
// `existing` The document already in storage, i.e. what rules see as
//            resource.data. Seeded before the case runs.

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
//
// That last claim was flagged as unconfirmed by an earlier run. It is now
// confirmed: the engine answers a signed-in `list /users` with
// "Null value error. for 'list' @ L10" — in a collection query {uid} has no
// concrete value, so `request.auth.uid == uid` errors and the allow does not
// fire. DENY was the right expectation.
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
  { label: "suppressions", doc: `${D}/suppressions/complainer-at-example-com`, col: `${D}/suppressions` },
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

// --- Group 5: coverage added once authenticated cases could actually run ---

// 5a. Arbitrary NON-subscription fields on the owner's own user document.
//
// users/{uid} used to constrain exactly one key, so everything else on the
// document was client-writable. That was not academic: the verification-email
// endpoint read verificationEmail.at as its ONLY cooldown, so a caller could
// backdate it from a browser console and loop the endpoint; start-trial reads
// welcomeEmail to decide whether to re-send; and only the exact string was
// blocked, so "Subscription" and "subscriptions" wrote fine.
//
// The rule is now an allowlist of the four fields the browser owns, and every
// case below asserts the write is refused. Each keeps `subscription`
// byte-identical, so what is being measured is the extra field and nothing
// else. If someone loosens the rule back to a denylist, these fail.
const arbitraryFieldCases = [
  { label: "add isAdmin:true", extra: { isAdmin: true } },
  { label: "add credits:999999", extra: { credits: 999999 } },
  { label: "add role:owner", extra: { role: "owner" } },
  {
    label: "backdate verificationEmail.at (the server's only send cooldown)",
    extra: { verificationEmail: { at: "1970-01-01T00:00:00.000Z" } },
  },
  { label: "clear trialEverStarted", extra: { trialEverStarted: false } },
  { label: 'add "Subscription" (capital S — a denylist only ever blocked the exact key)', extra: { Subscription: { plan: "agency" } } },
  { label: 'add "subscriptions" (plural — a denylist only ever blocked the exact key)', extra: { subscriptions: [{ plan: "agency" }] } },
];
for (const a of arbitraryFieldCases) {
  add({
    group: "added",
    label: `own user doc, ${a.label}`,
    uid: "userA",
    path: P.userDoc("userA"),
    method: "update",
    existing: { displayName: "A", subscription: { plan: "free" } },
    data: { displayName: "A", subscription: { plan: "free" }, ...a.extra },
    expect: "DENY",
  });
}
add({
  group: "added",
  label: "create own user doc carrying arbitrary extra fields (no subscription)",
  uid: "userA",
  path: P.userDoc("userA"),
  method: "create",
  data: { displayName: "A", isAdmin: true, credits: 999999, role: "owner" },
  expect: "DENY",
});

// 5b. Cross-tenant creates. The generic loop covers create-under-userB for
// every target; these are the ones worth naming in a report.
add({
  group: "added",
  label: "userA creates a site under userB",
  uid: "userA",
  path: `${D}/users/userB/sites/evil`,
  method: "create",
  data: { name: "planted", domain: "attacker.example" },
  expect: "DENY",
});
add({
  group: "added",
  label: "userA creates a lead under userB's site",
  uid: "userA",
  path: `${D}/users/userB/sites/s1/leads/evil`,
  method: "create",
  data: { email: "victim@example.com" },
  expect: "DENY",
});
add({
  group: "added",
  label: "userA creates a social post under userB's site",
  uid: "userA",
  path: `${D}/users/userB/sites/s1/social/evil`,
  method: "create",
  data: { status: "approved", body: "planted" },
  expect: "DENY",
});
add({
  group: "added",
  label: "userA creates a usage counter under userB's site",
  uid: "userA",
  path: `${D}/users/userB/sites/s1/usage/2026-09`,
  method: "create",
  data: { credits: 0 },
  expect: "DENY",
});

// 5c. Cross-user reads of the money and credential subtrees, named explicitly.
const crossUserReads = [
  { label: "userB's usage counters", doc: `${D}/users/userB/sites/s1/usage/2026-09`, col: `${D}/users/userB/sites/s1/usage` },
  { label: "userB's billing receipts", doc: `${D}/users/userB/billing/e1`, col: `${D}/users/userB/billing` },
  { label: "userB's integrations (OAuth token)", doc: `${D}/users/userB/sites/s1/integrations/github`, col: `${D}/users/userB/sites/s1/integrations` },
];
for (const t of crossUserReads) {
  add({
    group: "added",
    label: `userA reads ${t.label}`,
    uid: "userA",
    path: t.doc,
    method: "get",
    existing: { credits: 1, token: "ghp_secret" },
    expect: "DENY",
  });
  add({
    group: "added",
    label: `userA lists ${t.label}`,
    uid: "userA",
    path: t.col,
    method: "list",
    existing: { credits: 1, token: "ghp_secret" },
    expect: "DENY",
  });
}

// 5d. trialLedger as an authenticated user, spelled out per method. A client
// that could delete its own row could take unlimited free trials; one that
// could read the collection could test whether an address ever signed up.
for (const method of METHODS) {
  add({
    group: "added",
    label: `signed-in ${method} trialLedger (one-trial-per-person ledger)`,
    uid: "userA",
    path: method === "list" ? `${D}/trialLedger` : `${D}/trialLedger/f00dbabe`,
    method,
    existing: { uids: ["userB"], claimedAt: "2026-01-01" },
    data: { uids: ["userA"] },
    expect: "DENY",
  });
}

// 5e. The social "approved" flip, from all three sides.
//
// The ALLOW here is correct, not a hole. `status` on a social post is display
// state for the customer's own dashboard. Publishing does not read it as
// permission: /api/social/publish re-reads the post server-side with the admin
// SDK and refuses anything not carrying a real approval record, so a client
// that flips this field changes what its own screen says and nothing else.
// The two DENY cases are the ones that would matter — writing this field on
// somebody else's post, or without being signed in at all.
add({
  group: "added",
  label: "userA flips own social post status to approved (deliberate ALLOW — publish re-checks server-side)",
  uid: "userA",
  path: `${D}/users/userA/sites/s1/social/p1`,
  method: "update",
  existing: { status: "draft", body: "hello" },
  data: { status: "approved", body: "hello" },
  expect: "ALLOW",
});
add({
  group: "added",
  label: "userA flips userB's social post status to approved",
  uid: "userA",
  path: `${D}/users/userB/sites/s1/social/p1`,
  method: "update",
  existing: { status: "draft", body: "hello" },
  data: { status: "approved", body: "hello" },
  expect: "DENY",
});
add({
  group: "added",
  label: "unauthenticated flip of a social post status to approved",
  uid: null,
  path: `${D}/users/userA/sites/s1/social/p1`,
  method: "update",
  existing: { status: "draft", body: "hello" },
  data: { status: "approved", body: "hello" },
  expect: "DENY",
});

// ---------------------------------------------------------------------------
// Firestore REST value encoding
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Engine 1 (default): local Firestore emulator, driven with unsigned JWTs
// ---------------------------------------------------------------------------

const EMU_PROJECT = "madbot-rules-test";
const SEED_DOC_ID = "zzHarnessSeed"; // for list cases, so a list has something to return

// The emulator decodes the JWT payload and does not verify the signature.
// The third segment must be EMPTY — firebase-tools 14.x rejects a JWT with a
// placeholder signature string as "invalid jwt".
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function unsignedJwt(uid) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: "none", kid: "fakekid", typ: "JWT" }),
    b64url({
      iss: `https://securetoken.google.com/${EMU_PROJECT}`,
      aud: EMU_PROJECT,
      iat: now,
      exp: now + 3600,
      auth_time: now,
      sub: uid,
      user_id: uid,
      email_verified: false,
      firebase: { sign_in_provider: "custom", identities: {} },
    }),
    "",
  ].join(".");
}

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

// A small client. `as` is null for unauthenticated, "owner" for the emulator's
// admin bypass, or a uid for an unsigned-JWT request.
// `urlPath` is always a full "/databases/(default)/documents/..." path, the
// same shape the case matrix uses.
function makeClient(hostport) {
  async function call(method, urlPath, { as = null, body = null, query = "" } = {}) {
    const headers = {};
    if (as === "owner") headers.Authorization = "Bearer owner";
    else if (as) headers.Authorization = `Bearer ${unsignedJwt(as)}`;
    if (body) headers["Content-Type"] = "application/json";
    const r = await fetch(`http://${hostport}/v1/projects/${EMU_PROJECT}${urlPath}${query}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    return { status: r.status, text };
  }

  return {
    call,
    // Admin-bypass helpers used only for setup and teardown.
    async adminSet(docPath, data) {
      return call("PATCH", docPath, { as: "owner", body: { fields: toFields(data) } });
    },
    async adminDelete(docPath) {
      return call("DELETE", docPath, { as: "owner" });
    },
    async pushRules(content) {
      const res = await fetch(`http://${hostport}/emulator/v1/projects/${EMU_PROJECT}:securityRules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`could not load rules into the emulator: ${res.status} ${await res.text()}`);
    },
    async wipe() {
      const res = await fetch(`http://${hostport}/emulator/v1/projects/${EMU_PROJECT}/databases/(default)/documents`, {
        method: "DELETE",
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`could not clear emulator data: ${res.status} ${await res.text()}`);
    },
  };
}

// Turns one HTTP outcome into ALLOW / DENY / null (inconclusive).
function verdictOf(status, text) {
  if (status === 403 && /PERMISSION_DENIED/.test(text)) return { verdict: "DENY", note: reasonFrom(text) };
  if (status === 200) return { verdict: "ALLOW", note: null };
  // 404 = the rules let the read through and the document simply is not there.
  if (status === 404) return { verdict: "ALLOW", note: "HTTP 404 (rules passed, document absent)" };
  return { verdict: null, note: `inconclusive: HTTP ${status} ${text.slice(0, 400).replace(/\s+/g, " ")}` };
}

// The emulator reports which allow-rule line refused, e.g.
// "false for 'update' @ L71, false for 'update' @ L123". Worth keeping: it is
// the difference between "the intended rule said no" and "some other rule did".
function reasonFrom(text) {
  try {
    const msg = JSON.parse(text)?.error?.message;
    if (!msg) return null;
    return msg.trim().replace(/\s+/g, " ").slice(0, 300);
  } catch {
    return null;
  }
}

// ---- negative controls ----------------------------------------------------

const CONTROL_RULES_OPEN = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /harnessSelfcheckOpen/{id} { allow read, write: if true; }
    match /{document=**} { allow read, write: if false; }
  }
}`;

const CONTROL_RULES_UID = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /harnessSelfcheckUid/{u} {
      allow read, write: if request.auth != null && request.auth.uid == u;
    }
    match /{document=**} { allow read, write: if false; }
  }
}`;

const CONTROL_RULES_SHUT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}`;

async function negativeControls(client, log) {
  const probe = async (docPath, as) => {
    const { status, text } = await client.call("GET", docPath, { as });
    return verdictOf(status, text).verdict;
  };

  // Control 1 + 2: ALLOW and DENY are both observable, unauthenticated.
  await client.pushRules(CONTROL_RULES_OPEN);
  const open = await probe(`${D}/harnessSelfcheckOpen/x`, null);
  const shut = await probe(`${D}/harnessSelfcheckClosed/x`, null);
  if (open !== "ALLOW" || shut !== "DENY") {
    return `control 1/2 failed: unauthenticated read of an allowed path came back "${open}" (want ALLOW) and of a denied path "${shut}" (want DENY)`;
  }
  log("  control 1+2 ok: unauthenticated ALLOW and DENY are both observable");

  // Control 3: the uid in the unsigned JWT actually binds. Without this, an
  // ignored token would make every cross-user DENY case pass for free.
  await client.pushRules(CONTROL_RULES_UID);
  // Seed both, so an ALLOW here is a real 200 read of a real document rather
  // than a 404 that merely means "the rules did not stop me".
  await client.adminSet(`${D}/harnessSelfcheckUid/userA`, { owner: "userA" });
  await client.adminSet(`${D}/harnessSelfcheckUid/userB`, { owner: "userB" });
  const mine = await probe(`${D}/harnessSelfcheckUid/userA`, "userA");
  const theirs = await probe(`${D}/harnessSelfcheckUid/userB`, "userA");
  const anonMine = await probe(`${D}/harnessSelfcheckUid/userA`, null);
  if (mine !== "ALLOW" || theirs !== "DENY" || anonMine !== "DENY") {
    return (
      `control 3 failed: the uid in the unsigned JWT does not bind — ` +
      `uid=userA on /userA read as "${mine}" (want ALLOW), uid=userA on /userB as "${theirs}" (want DENY), ` +
      `no-auth on /userA as "${anonMine}" (want DENY)`
    );
  }
  log("  control 3 ok: the uid in the unsigned JWT binds, and cross-uid is refused");

  // Control 4: the admin bypass works (seeding is real) and an ordinary user
  // token is NOT an admin token.
  await client.pushRules(CONTROL_RULES_SHUT);
  const seeded = await client.adminSet(`${D}/harnessSelfcheckAdmin/x`, { ok: true });
  if (seeded.status !== 200) {
    return `control 4 failed: the emulator admin bypass could not seed a document (HTTP ${seeded.status} ${seeded.text.slice(0, 200)})`;
  }
  const asOwner = await probe(`${D}/harnessSelfcheckAdmin/x`, "owner");
  const asUser = await probe(`${D}/harnessSelfcheckAdmin/x`, "userA");
  const asAnon = await probe(`${D}/harnessSelfcheckAdmin/x`, null);
  if (asOwner !== "ALLOW" || asUser !== "DENY" || asAnon !== "DENY") {
    return (
      `control 4 failed: under all-deny rules the admin bypass read as "${asOwner}" (want ALLOW), ` +
      `a user token as "${asUser}" (want DENY), no auth as "${asAnon}" (want DENY)`
    );
  }
  log("  control 4 ok: admin bypass seeds documents, and a user token is not an admin token");

  await client.wipe();
  return null;
}

// ---- per-case execution ---------------------------------------------------

// Every case gets a clean, known starting state, because the rules engine
// decides `create` vs `update` from whether the document exists.
async function prepareCase(client, c) {
  const isList = c.method === "list";
  const target = isList ? `${c.path}/${SEED_DOC_ID}` : c.path;

  await client.adminDelete(target); // 200 whether or not it was there

  if (c.method !== "create") {
    const seed = await client.adminSet(target, c.existing || { field: "before" });
    if (seed.status !== 200) {
      return { target, error: `could not seed ${target}: HTTP ${seed.status} ${seed.text.slice(0, 200)}` };
    }
  }
  return { target, error: null };
}

async function issueCase(client, c) {
  const as = c.uid || null;
  switch (c.method) {
    case "get":
    case "list":
      // A collection path here is a ListDocuments call, which the engine
      // evaluates as `list`; a document path is evaluated as `get`.
      return client.call("GET", c.path, { as });
    case "create": {
      const i = c.path.lastIndexOf("/");
      const parent = c.path.slice(0, i);
      const docId = c.path.slice(i + 1);
      return client.call("POST", parent, {
        as,
        query: `?documentId=${encodeURIComponent(docId)}`,
        body: { fields: toFields(c.data) },
      });
    }
    case "update":
      // No updateMask => full overwrite, so request.resource.data === c.data.
      return client.call("PATCH", c.path, { as, body: { fields: toFields(c.data) } });
    case "delete":
      return client.call("DELETE", c.path, { as });
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

  const client = makeClient(hostport);

  try {
    const bad = await negativeControls(client, log);
    if (bad) return { available: false, reason: bad };

    await client.pushRules(RULES);
    await client.wipe();
    log("  loaded the repo's firestore.rules into the emulator, cleared its data");

    const results = new Map();
    for (const c of cases) {
      const prep = await prepareCase(client, c);
      if (prep.error) {
        results.set(c.id, { verdict: null, note: `not run: ${prep.error}` });
        continue;
      }
      try {
        const { status, text } = await issueCase(client, c);
        results.set(c.id, verdictOf(status, text));
      } catch (err) {
        results.set(c.id, { verdict: null, note: `not run: request failed (${err.message})` });
      } finally {
        await client.adminDelete(prep.target);
      }
    }
    return { available: true, results };
  } finally {
    stop();
  }
}

// ---------------------------------------------------------------------------
// Engine 2 (opt-in, RULES_ENGINE=api): Google's TestRuleset API
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

  // The API cannot model a `list`. Its request.path is matched against the
  // rules' match patterns, which always end in a document segment: a
  // collection path matches nothing and denies, and a document path binds the
  // wildcard and answers a different question (it says `list /users/userA` is
  // ALLOW, where a real unconstrained query over /users is DENY). Declining is
  // the only honest option; the emulator engine answers these.
  const LIST_UNSUPPORTED =
    "not run: the TestRuleset API cannot express a collection query — it matches request.path " +
    "against document-shaped match patterns, so a list case is either matched by no rule or " +
    "silently rewritten into a single-document query. Use the default emulator engine.";
  const evaluable = [];
  for (const c of cases) {
    if (c.method === "list") results.set(c.id, { verdict: null, note: LIST_UNSUPPORTED });
    else evaluable.push(c);
  }
  log(`  ${evaluable.length} of ${cases.length} cases are evaluable by this engine (list cases declined)`);

  const BATCH = 100;
  for (let i = 0; i < evaluable.length; i += BATCH) {
    const chunk = evaluable.slice(i, i + BATCH);
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
            (perm ? `, missing "${perm}"` : "") +
            `). The default emulator engine needs no such grant.`,
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
// Runner
// ---------------------------------------------------------------------------

function authLabel(c) {
  return c.uid ? `auth=${c.uid}` : "auth=none";
}

async function main() {
  const log = (s) => process.stdout.write(`${s}\n`);
  const wanted = (process.env.RULES_ENGINE || "emulator").toLowerCase();

  log("Firestore security-rules test suite");
  log(`  rules:  ${RULES_PATH}`);
  log(`  cases:  ${cases.length}`);
  log("");

  let engineName;
  let run;
  if (wanted === "api") {
    log("Engine: TestRuleset API (firebaserules.googleapis.com) [RULES_ENGINE=api]");
    engineName = "TestRuleset API";
    run = await runApiEngine(log);
  } else {
    log("Engine: local Firestore emulator, unsigned JWTs, admin-bypass seeding");
    engineName = "local Firestore emulator";
    run = await runEmulatorEngine(log);
  }
  if (!run.available) {
    log(`  UNAVAILABLE: ${run.reason}`);
    log("");
    log("FATAL: no rules engine available, so nothing was proved. Exiting non-zero.");
    process.exit(2);
  }
  log("");

  const groups = ["ownership", "unauth", "escalation", "default-deny", "added"];
  const titles = {
    ownership: "Ownership isolation",
    unauth: "Unauthenticated access",
    escalation: "Privilege escalation",
    "default-deny": "Deny by default",
    added: "Added coverage",
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
  log(`Skipped     : ${notRun.length}`);
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
    log(`${notRun.length} case(s) could not be evaluated. A case that cannot distinguish`);
    log("allow from deny is not a pass, so this run does not certify the rules.");
  }

  process.exit(failures.length || notRun.length ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`\nunexpected error: ${err && err.stack ? err.stack : err}\n`);
  process.exit(3);
});
