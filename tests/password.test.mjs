// lib/password.js — the one definition of an acceptable password.
//
// Two things matter here. It must not throw: this runs on every keystroke in the
// sign-up form, and an exception there is a form that cannot be submitted. And
// it must actually reject the things it claims to reject, because the same
// function is the only floor between a customer and a guessable account.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const { MIN_LENGTH, MAX_LENGTH, checkRules, isAcceptable, strength, serverPasswordError } = await import(
  "../lib/password.js"
);

const ruleIds = (password, ctx) => checkRules(password, ctx).filter((r) => !r.ok).map((r) => r.id);
const GOOD = "violet-harbour-swift-42";

// ---------------------------------------------------------------------------
// Nothing throws
// ---------------------------------------------------------------------------

const HOSTILE = [
  ["empty string", ""],
  ["undefined", undefined],
  ["null", null],
  ["a number", 12345678901],
  ["a plain object", {}],
  ["an array", []],
  ["200 characters", "q".repeat(200)],
  ["200 varied characters", "Zx9!".repeat(50)],
  ["only whitespace", "          "],
  ["a lone emoji", "🙂"],
  ["a surrogate-pair passphrase", "🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂"],
  ["a newline", "\n\n\n\n\n\n\n\n\n\n\n"],
  ["a regex-special string", "$^.*+?()[]{}|\\/"],
];

for (const [label, value] of HOSTILE) {
  test(`checkRules does not throw on ${label}`, () => {
    assert.doesNotThrow(() => checkRules(value));
    assert.doesNotThrow(() => checkRules(value, { email: undefined, name: undefined }));
    assert.doesNotThrow(() => checkRules(value, { email: null, name: null }));
  });

  test(`isAcceptable does not throw on ${label} and returns a boolean`, () => {
    let out;
    assert.doesNotThrow(() => {
      out = isAcceptable(value);
    });
    assert.equal(typeof out, "boolean", `returned ${typeof out}`);
  });

  test(`strength does not throw on ${label} and stays in 0-4`, () => {
    let out;
    assert.doesNotThrow(() => {
      out = strength(value);
    });
    assert.ok(Number.isInteger(out.score), `score was ${out.score}`);
    assert.ok(out.score >= 0 && out.score <= 4, `score was ${out.score}`);
    assert.equal(typeof out.label, "string", `label was ${typeof out.label}`);
  });
}

test("checkRules does not throw on a hostile context", () => {
  for (const ctx of [{}, { email: 12345 }, { name: {} }, { email: [], name: [] }, { email: "@", name: " " }]) {
    assert.doesNotThrow(() => checkRules(GOOD, ctx), JSON.stringify(ctx));
  }
});

test("checkRules always returns the same five rules with an id, a label and a boolean", () => {
  for (const [, value] of HOSTILE) {
    const rules = checkRules(value);
    assert.deepEqual(rules.map((r) => r.id), ["length", "letter", "number", "notCommon", "notPersonal"]);
    for (const r of rules) {
      assert.ok(r.label, `${r.id} has no label`);
      assert.equal(typeof r.ok, "boolean", `${r.id}.ok is ${typeof r.ok}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

test("rejects anything shorter than the minimum", () => {
  for (let n = 0; n < MIN_LENGTH; n += 1) {
    const p = `Ab3${"x".repeat(Math.max(0, n - 3))}`.slice(0, n);
    assert.equal(isAcceptable(p), false, `accepted a ${n}-character password "${p}"`);
  }
});

test("accepts at exactly the minimum length", () => {
  const p = "Vh7-tempus";
  assert.equal(p.length, MIN_LENGTH);
  assert.equal(isAcceptable(p), true, `rejected a ${MIN_LENGTH}-character password: ${ruleIds(p).join(", ")}`);
});

test("rejects anything above the maximum length", () => {
  assert.ok(ruleIds("Vh7-tempus".padEnd(MAX_LENGTH + 1, "z")).includes("length"));
});

test("rejects the common passwords, wherever they appear in the string", () => {
  for (const p of [
    "password123",
    "MyPassword99",
    "letmein-please1",
    "welcome-2024-ok",
    "qwertyuiop1",
    "iloveyou-forever",
    "the-admin-account9",
    "madbot-is-great",
    "getmadbot-now-9",
    "Sunshine-and-rain",
    "footballdragon1",
    "PRINCESS-tiara-7",
  ]) {
    assert.ok(ruleIds(p).includes("notCommon"), `"${p}" was not flagged as common`);
    assert.equal(isAcceptable(p), false, `"${p}" was accepted`);
  }
});

test("rejects four or more of the same character in a row", () => {
  for (const p of ["thunderrrrbolt99", "aaaa-quiet-lane7", "quiet-lane-11119", "Vh7-tempusZZZZ"]) {
    assert.ok(ruleIds(p).includes("notCommon"), `"${p}" was not flagged for a repeated run`);
  }
  assert.ok(!ruleIds("thunderrrbolt99").includes("notCommon"), "three in a row should still be allowed");
});

test("rejects digit sequences forwards and backwards", () => {
  for (const p of ["tempus1234ok", "tempus4321ok", "tempus6789ok", "tempus9876ok", "tempus0123ok"]) {
    assert.ok(ruleIds(p).includes("notCommon"), `"${p}" was not flagged as a sequence`);
  }
});

test("rejects alphabet sequences forwards and backwards, and case-insensitively", () => {
  for (const p of ["tempus-abcd-99", "tempus-DCBA-99", "tempus-wxyz-99", "tempus-ZYXW-99", "tempus-mnop-99"]) {
    assert.ok(ruleIds(p).includes("notCommon"), `"${p}" was not flagged as a sequence`);
  }
});

test("rejects keyboard-row sequences forwards and backwards", () => {
  for (const p of ["tempus-qwer-99", "tempus-rewq-99", "tempus-tyui-99", "tempus-poiu-99", "tempus-ERTY-99"]) {
    assert.ok(ruleIds(p).includes("notCommon"), `"${p}" was not flagged as a keyboard run`);
  }
});

test("rejects the local part of the user's own email address", () => {
  const ctx = { email: "siddhant@omnissolutio.com" };
  for (const p of ["siddhant-tempus-9", "my-siddhant-pw-7", "SIDDHANT-Tempus9"]) {
    assert.ok(ruleIds(p, ctx).includes("notPersonal"), `"${p}" was not flagged as personal`);
    assert.equal(isAcceptable(p, ctx), false, `"${p}" was accepted`);
  }
});

test("rejects the user's own name", () => {
  const ctx = { name: "Siddhant" };
  for (const p of ["siddhant-tempus-9", "Tempus-Siddhant-7"]) {
    assert.ok(ruleIds(p, ctx).includes("notPersonal"), `"${p}" was not flagged as personal`);
  }
});

test("rejects the user's own full name with the space removed", () => {
  // The most common way a person puts their name in a password. The rule
  // compares against the trimmed name verbatim, so a space is all it takes.
  const ctx = { name: "Siddhant Mallah", email: "" };
  const p = "SiddhantMallah7";
  assert.ok(
    ruleIds(p, ctx).includes("notPersonal"),
    `"${p}" was accepted for a user named "Siddhant Mallah" — the rule only matches the name including its space`
  );
});

test("rejects the user's full name written with a different separator", () => {
  const ctx = { name: "Siddhant Mallah", email: "" };
  for (const p of ["Siddhant.Mallah7", "siddhant-mallah-1", "Siddhant_Mallah7"]) {
    assert.ok(ruleIds(p, ctx).includes("notPersonal"), `"${p}" was accepted for a user named "Siddhant Mallah"`);
  }
});

test("a one or two character name or email local part is not used as a rule", () => {
  // Otherwise every password containing "al" would be refused.
  assert.equal(isAcceptable(GOOD, { name: "Al", email: "al@x.com" }), true, ruleIds(GOOD, { name: "Al" }).join(", "));
});

test("rejects a long passphrase with no letter, and one with neither number nor symbol", () => {
  assert.ok(ruleIds("857392068417").includes("letter"));
  assert.ok(ruleIds("tempusviolet").includes("number"));
});

test("a symbol satisfies the number rule, since the rule says number or symbol", () => {
  assert.ok(!ruleIds("tempus-violet").includes("number"));
});

// ---------------------------------------------------------------------------
// Acceptances
// ---------------------------------------------------------------------------

test("accepts a genuinely good passphrase", () => {
  assert.equal(isAcceptable(GOOD), true, `rejected for: ${ruleIds(GOOD).join(", ")}`);
});

test("accepts several other good passphrases", () => {
  for (const p of ["copper-lantern-moth-8", "Thunder!Pigeon!Quilt", "9-tempus-violet-oak", "grsl_krtk_wmbt_7"]) {
    assert.equal(isAcceptable(p), true, `rejected "${p}" for: ${ruleIds(p).join(", ")}`);
  }
});

test("isAcceptable and checkRules never disagree", () => {
  for (const p of [GOOD, "", "password1", "Vh7-tempus", "q".repeat(200), "tempus-abcd-99"]) {
    assert.equal(isAcceptable(p), checkRules(p).every((r) => r.ok), `disagreed on "${p.slice(0, 20)}"`);
  }
});

// ---------------------------------------------------------------------------
// strength
// ---------------------------------------------------------------------------

test("strength is 0 with an empty label for no input", () => {
  assert.deepEqual(strength(""), { score: 0, label: "" });
  assert.deepEqual(strength(undefined), { score: 0, label: "" });
});

test("strength is 1 for anything unacceptable", () => {
  for (const p of ["short", "password123", "tempus-abcd-99", "q".repeat(200)]) {
    assert.equal(strength(p).score, 1, `"${p.slice(0, 20)}" scored ${strength(p).score}`);
  }
});

test("strength rises with length and never exceeds 4", () => {
  assert.equal(strength("Vh7-tempus").score, 2);
  assert.equal(strength("Vh7-tempus-oak").score, 3);
  assert.equal(strength(GOOD).score, 4);
  assert.equal(strength("Vh7-tempus-oak-copper-lantern-moth").score, 4);
});

test("strength stays inside 0-4 across a wide sweep of inputs", () => {
  for (let n = 0; n <= 140; n += 1) {
    const p = `Vh7-${"tempusviolet".repeat(20).slice(0, n)}`;
    const s = strength(p);
    assert.ok(s.score >= 0 && s.score <= 4, `length ${p.length} scored ${s.score}`);
    assert.equal(typeof s.label, "string");
  }
});

test("strength's label matches its score", () => {
  const labels = { 0: "", 1: "Not yet usable", 2: "Fine", 3: "Good", 4: "Strong" };
  for (const p of ["", "short", "Vh7-tempus", "Vh7-tempus-oak", GOOD]) {
    const s = strength(p);
    assert.equal(s.label, labels[s.score], `"${p}" scored ${s.score} with label "${s.label}"`);
  }
});

test("strength honours the context it is given", () => {
  const ctx = { email: "siddhant@omnissolutio.com" };
  assert.equal(strength("siddhant-tempus-9", ctx).score, 1);
  assert.equal(strength("siddhant-tempus-9").score > 1, true, "without the context it is only a long passphrase");
});

// ---------------------------------------------------------------------------
// serverPasswordError
// ---------------------------------------------------------------------------

test("serverPasswordError translates Firebase's weak-password code and nothing else", () => {
  assert.ok(serverPasswordError("auth/weak-password").includes(String(MIN_LENGTH)));
  assert.equal(serverPasswordError("auth/email-already-in-use"), null);
  assert.equal(serverPasswordError(""), null);
  assert.doesNotThrow(() => serverPasswordError(undefined));
  assert.equal(serverPasswordError(undefined), null);
});
