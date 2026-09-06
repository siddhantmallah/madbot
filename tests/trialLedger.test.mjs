// lib/trialLedger.js — one free trial per person, not per account.
//
// The module imports firebase-admin, so it is loaded through a try/catch: on a
// machine with no service account it still imports cleanly (firebase-admin is
// only touched inside the async functions), but that is worth proving rather
// than assuming. Only normaliseEmail, ledgerKey and domainOf are pure; the rest
// need Firestore.
//
// A trial runs at Growth level and spends real money on model calls, so every
// address shape that slips past normalisation is fourteen more free days.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

let ledger = null;
let importError = null;
try {
  ledger = await import("../lib/trialLedger.js");
} catch (err) {
  importError = err;
}

test("lib/trialLedger.js imports without a service account present", () => {
  assert.equal(
    importError,
    null,
    `importing the module threw: ${importError?.message} — the pure helpers below could not be reached`
  );
  assert.equal(typeof ledger?.normaliseEmail, "function");
  assert.equal(typeof ledger?.ledgerKey, "function");
  assert.equal(typeof ledger?.domainOf, "function");
});

const { normaliseEmail, ledgerKey, domainOf, LEDGER_COLLECTION } = ledger || {};

// ---------------------------------------------------------------------------
// normaliseEmail
// ---------------------------------------------------------------------------

test("gmail dots are stripped", () => {
  assert.equal(normaliseEmail("m.a.l.l.a.h@gmail.com"), "mallah@gmail.com");
  assert.equal(normaliseEmail("mallah@gmail.com"), "mallah@gmail.com");
  assert.equal(normaliseEmail("m.allah@gmail.com"), "mallah@gmail.com");
});

test("gmail plus-tags are stripped", () => {
  assert.equal(normaliseEmail("mallah+trial2@gmail.com"), "mallah@gmail.com");
  assert.equal(normaliseEmail("mallah+a+b+c@gmail.com"), "mallah@gmail.com");
});

test("dots and plus-tags are stripped together", () => {
  assert.equal(normaliseEmail("m.a.llah+free-trial-3@gmail.com"), "mallah@gmail.com");
});

test("plus-tags are stripped on non-gmail hosts too, since nearly every provider routes them the same way", () => {
  assert.equal(normaliseEmail("first+tag@company.com"), "first@company.com");
  assert.equal(normaliseEmail("first+tag@outlook.com"), "first@outlook.com");
});

test("dots are PRESERVED outside the dot-insensitive hosts", () => {
  assert.equal(normaliseEmail("first.last@company.com"), "first.last@company.com");
  assert.equal(normaliseEmail("first.last@outlook.com"), "first.last@outlook.com");
  assert.equal(normaliseEmail("i.t.support@omnissolutio.com"), "i.t.support@omnissolutio.com");
});

test("case is folded and surrounding whitespace trimmed", () => {
  assert.equal(normaliseEmail("  MALLAH@GMAIL.COM  "), "mallah@gmail.com");
  assert.equal(normaliseEmail("First.Last@Company.COM"), "first.last@company.com");
  assert.equal(normaliseEmail("\tMallah+Trial@Gmail.com\n"), "mallah@gmail.com");
});

test("googlemail.com is treated as dot-insensitive", () => {
  assert.equal(normaliseEmail("m.a.llah@googlemail.com"), "mallah@googlemail.com");
});

test("googlemail.com and gmail.com are the same inbox and must normalise to the same address", () => {
  // Google delivers @googlemail.com to the @gmail.com mailbox — the module's own
  // header names this as the reason for normalising at all. Dots are stripped for
  // both hosts, but the host itself is never canonicalised, so the two produce
  // different ledger keys.
  assert.equal(
    normaliseEmail("mallah@googlemail.com"),
    normaliseEmail("mallah@gmail.com"),
    "the same Google inbox normalises to two different addresses, so it can take two trials"
  );
});

test("an address with several @ signs uses the last one as the separator", () => {
  assert.equal(normaliseEmail('"odd@local"@company.com'), '"odd@local"@company.com');
});

test("anything that is not a plausible address returns null, so the caller fails closed", () => {
  for (const value of [
    "",
    "   ",
    null,
    undefined,
    "notanemail",
    "@gmail.com",
    "  @gmail.com",
    "user@",
    "user@nodot",
    "@",
    "a@b",
    ".@gmail.com",
    "...@gmail.com",
    {},
    [],
    0,
    false,
  ]) {
    assert.equal(normaliseEmail(value), null, `normaliseEmail(${JSON.stringify(value)}) should be null`);
  }
});

test("normaliseEmail never throws on hostile input", () => {
  for (const value of [{}, [], 0, false, Symbol.iterator ? 12345 : 0, () => {}, new Date()]) {
    assert.doesNotThrow(() => normaliseEmail(value), String(value));
  }
});

test("normaliseEmail is idempotent", () => {
  for (const value of ["m.a.llah+x@gmail.com", "First.Last@Company.com", "a@b.co"]) {
    const once = normaliseEmail(value);
    assert.equal(normaliseEmail(once), once, `${value} changed on a second pass`);
  }
});

// ---------------------------------------------------------------------------
// ledgerKey
// ---------------------------------------------------------------------------

test("ledgerKey is a 64-character lowercase hex string", () => {
  const key = ledgerKey("mallah@gmail.com");
  assert.equal(typeof key, "string");
  assert.equal(key.length, 64, `key was ${key.length} characters`);
  assert.match(key, /^[0-9a-f]{64}$/);
});

test("ledgerKey is stable across calls", () => {
  const a = ledgerKey("mallah@gmail.com");
  for (let i = 0; i < 5; i += 1) assert.equal(ledgerKey("mallah@gmail.com"), a, `call ${i} differed`);
});

test("two addresses that normalise the same produce the same key", () => {
  const pairs = [
    ["mallah@gmail.com", "m.a.l.l.a.h@gmail.com"],
    ["mallah@gmail.com", "mallah+trial2@gmail.com"],
    ["mallah@gmail.com", "  M.A.LLAH+free@GMAIL.COM  "],
    ["first.last@company.com", "FIRST.LAST@Company.com"],
    ["first@company.com", "first+anything@company.com"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(ledgerKey(a), ledgerKey(b), `"${a}" and "${b}" produced different keys — the second could take another trial`);
  }
});

test("two genuinely different addresses produce different keys", () => {
  const pairs = [
    ["mallah@gmail.com", "mallahh@gmail.com"],
    ["first.last@company.com", "firstlast@company.com"],
    ["mallah@gmail.com", "mallah@company.com"],
  ];
  for (const [a, b] of pairs) {
    assert.notEqual(ledgerKey(a), ledgerKey(b), `"${a}" and "${b}" collide`);
  }
});

test("the same Google inbox reached two ways produces one ledger key", () => {
  assert.equal(
    ledgerKey("mallah@googlemail.com"),
    ledgerKey("mallah@gmail.com"),
    "@googlemail.com yields a second ledger key for the same inbox — a second free 14-day Growth trial per person"
  );
});

test("ledgerKey returns null for anything normaliseEmail rejects", () => {
  for (const value of ["", null, undefined, "notanemail", "@gmail.com", "a@b", {}]) {
    assert.equal(ledgerKey(value), null, `ledgerKey(${JSON.stringify(value)})`);
  }
});

test("ledgerKey never throws", () => {
  for (const value of [{}, [], 0, false, new Date(), () => {}]) {
    assert.doesNotThrow(() => ledgerKey(value), String(value));
  }
});

test("ledgerKey is not a readable address — the plain address never appears in it", () => {
  const key = ledgerKey("mallah@gmail.com");
  assert.ok(!key.includes("mallah"), "the key leaks the local part");
  assert.ok(!Buffer.from(key, "hex").toString("latin1").includes("mallah"), "the key decodes to the address");
});

test("the pepper changes the key, so the ledger is not a rainbow-table lookup", () => {
  const before = process.env.TRIAL_LEDGER_PEPPER;
  try {
    process.env.TRIAL_LEDGER_PEPPER = "";
    const unpeppered = ledgerKey("mallah@gmail.com");
    process.env.TRIAL_LEDGER_PEPPER = "a-secret-value";
    const peppered = ledgerKey("mallah@gmail.com");
    assert.notEqual(unpeppered, peppered, "the pepper is being ignored");
    assert.match(peppered, /^[0-9a-f]{64}$/);
  } finally {
    if (before === undefined) delete process.env.TRIAL_LEDGER_PEPPER;
    else process.env.TRIAL_LEDGER_PEPPER = before;
  }
});

// ---------------------------------------------------------------------------
// domainOf
// ---------------------------------------------------------------------------

test("domainOf returns the normalised domain, or null", () => {
  assert.equal(domainOf("Mallah+x@GMAIL.com"), "gmail.com");
  assert.equal(domainOf("first.last@company.co.uk"), "company.co.uk");
  assert.equal(domainOf("notanemail"), null);
  assert.equal(domainOf(""), null);
  assert.equal(domainOf(null), null);
});

test("the ledger collection name is a stable non-empty string", () => {
  assert.equal(LEDGER_COLLECTION, "trialLedger");
});

test("the Firestore-backed helpers exist but need a database", () => {
  // Documented rather than exercised: trialHistoryFor, readLedgerInTx,
  // claimInTx and recordAttemptInTx all take a Firestore handle or transaction.
  for (const fn of ["trialHistoryFor", "readLedgerInTx", "claimInTx", "recordAttemptInTx"]) {
    assert.equal(typeof ledger[fn], "function", `${fn} is missing`);
  }
});
