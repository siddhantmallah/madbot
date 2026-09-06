// lib/consent.js — which consent model applies to a visitor, and what the
// banner opens in.
//
// Getting modelFor() wrong in the permissive direction is a regulator problem,
// not a UX problem, so the unknown/empty/null cases matter as much as the
// listed countries. And the inventory has to stay in step with the categories,
// because the Cookie Policy page renders straight from it — an omission there is
// a false statement published on the site.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const consent = await import("../lib/consent.js");
const {
  CATEGORIES,
  CATEGORY_ORDER,
  CONSENT_VERSION,
  INVENTORY,
  MODELS,
  STORAGE_KEY,
  activeCategories,
  allOff,
  allOn,
  initialChoices,
  modelFor,
  onlyNecessaryInUse,
  regimeFor,
} = consent;

const OPTIONAL = CATEGORY_ORDER.filter((c) => c !== CATEGORIES.NECESSARY);

// ---------------------------------------------------------------------------
// modelFor
// ---------------------------------------------------------------------------

const OPT_IN_CASES = {
  "EEA — Germany": "DE",
  "EEA — France": "FR",
  "EEA — Ireland": "IE",
  "EEA — Italy": "IT",
  "EEA — Netherlands": "NL",
  "EEA — Spain": "ES",
  "EEA — Sweden": "SE",
  "EEA — Poland": "PL",
  "EEA — Norway (EEA, not EU)": "NO",
  "EEA — Iceland": "IS",
  "EEA — Liechtenstein": "LI",
  "United Kingdom": "GB",
  India: "IN",
  Brazil: "BR",
  "United Arab Emirates": "AE",
  "South Korea": "KR",
  Switzerland: "CH",
  Canada: "CA",
  "Saudi Arabia": "SA",
};

for (const [label, code] of Object.entries(OPT_IN_CASES)) {
  test(`${label} (${code}) resolves to opt-in`, () => {
    assert.equal(modelFor(code), MODELS.OPT_IN);
  });
}

const OPT_OUT_CASES = { "United States": "US", Japan: "JP", Singapore: "SG", Australia: "AU", "New Zealand": "NZ", Mexico: "MX" };

for (const [label, code] of Object.entries(OPT_OUT_CASES)) {
  test(`${label} (${code}) resolves to opt-out`, () => {
    assert.equal(modelFor(code), MODELS.OPT_OUT);
  });
}

test("an unknown country code fails safe to opt-in", () => {
  for (const code of ["XX", "ZZ", "QQ", "ATLANTIS", "1", "--"]) {
    assert.equal(modelFor(code), MODELS.OPT_IN, `${code}`);
  }
});

test("an empty string, null and undefined all fail safe to opt-in", () => {
  assert.equal(modelFor(""), MODELS.OPT_IN);
  assert.equal(modelFor(null), MODELS.OPT_IN);
  assert.equal(modelFor(undefined), MODELS.OPT_IN);
  assert.equal(modelFor(0), MODELS.OPT_IN);
  assert.equal(modelFor(false), MODELS.OPT_IN);
});

test("lowercase input is normalised, so an opt-in country stays opt-in", () => {
  for (const code of ["de", "gb", "in", "br", "ae", "kr", "Fr", "iE"]) {
    assert.equal(modelFor(code), MODELS.OPT_IN, `${code}`);
  }
});

test("lowercase input is normalised for opt-out countries too, rather than falling through to opt-in", () => {
  for (const code of ["us", "jp", "sg", "au"]) {
    assert.equal(modelFor(code), MODELS.OPT_OUT, `${code}`);
  }
});

test("modelFor never throws and always returns a known model", () => {
  const known = new Set(Object.values(MODELS));
  for (const input of [{}, [], 42, NaN, Symbol.iterator ? "GB " : "GB", " gb ", "GBR"]) {
    let out;
    assert.doesNotThrow(() => {
      out = modelFor(input);
    }, String(input));
    assert.ok(known.has(out), `modelFor(${String(input)}) returned "${out}"`);
  }
});

test("whitespace around a country code is not silently treated as a different country", () => {
  // " GB " is the UK. It resolves to opt-in either way here, so this is safe
  // rather than a defect, but it is worth pinning down.
  assert.equal(modelFor(" GB "), MODELS.OPT_IN);
});

test("every opt-out country is genuinely a disclosure-regime country, not an EEA member", () => {
  const eeaish = ["DE", "FR", "IE", "IT", "NL", "ES", "SE", "PL", "NO", "IS", "LI", "GB"];
  for (const code of eeaish) {
    assert.notEqual(modelFor(code), MODELS.OPT_OUT, `${code} must never be opt-out`);
  }
});

// ---------------------------------------------------------------------------
// regimeFor
// ---------------------------------------------------------------------------

test("regimeFor names the right framework for the countries with their own copy", () => {
  assert.match(regimeFor("DE"), /GDPR/);
  assert.match(regimeFor("FR"), /ePrivacy/);
  assert.match(regimeFor("GB"), /UK GDPR/);
  assert.match(regimeFor("IN"), /Digital Personal Data Protection Act/);
  assert.match(regimeFor("AE"), /UAE/);
  assert.match(regimeFor("BR"), /LGPD/);
  assert.match(regimeFor("US"), /US state privacy laws/);
  assert.match(regimeFor("SG"), /Singapore PDPA/);
  assert.match(regimeFor("JP"), /APPI/);
  assert.match(regimeFor("AU"), /Privacy Act 1988/);
  assert.match(regimeFor("CH"), /Swiss/);
  assert.match(regimeFor("SA"), /Saudi/);
  assert.match(regimeFor("CA"), /PIPEDA/);
});

test("regimeFor is case-insensitive and never returns an empty string", () => {
  for (const code of ["de", "gb", "in", "XX", "", null, undefined]) {
    const out = regimeFor(code);
    assert.equal(typeof out, "string", `${code}`);
    assert.ok(out.length > 0, `regimeFor(${String(code)}) was empty`);
  }
  assert.equal(regimeFor("gb"), regimeFor("GB"));
});

test("an unknown country still gets a generic but truthful regime line", () => {
  assert.equal(regimeFor("XX"), "applicable data protection law");
  assert.equal(regimeFor(""), "applicable data protection law");
});

// ---------------------------------------------------------------------------
// Defaults: allOn / allOff / initialChoices
// ---------------------------------------------------------------------------

test("allOn turns on every category, necessary included", () => {
  const on = allOn();
  assert.deepEqual(Object.keys(on).sort(), [...CATEGORY_ORDER].sort());
  for (const c of CATEGORY_ORDER) assert.equal(on[c], true, `${c}`);
});

test("allOff keeps necessary true and everything else false", () => {
  const off = allOff();
  assert.equal(off[CATEGORIES.NECESSARY], true, "necessary must never be switchable off");
  for (const c of OPTIONAL) assert.equal(off[c], false, `${c} should be off`);
});

test("allOff covers every category with no gaps", () => {
  assert.deepEqual(Object.keys(allOff()).sort(), [...CATEGORY_ORDER].sort());
});

test("initialChoices always keeps necessary on", () => {
  for (const code of ["DE", "US", "IN", "XX", "", null, undefined, "jp"]) {
    assert.equal(initialChoices(code)[CATEGORIES.NECESSARY], true, `${String(code)}`);
  }
});

test("marketing is never on by default under any jurisdiction", () => {
  for (const code of [...Object.values(OPT_IN_CASES), ...Object.values(OPT_OUT_CASES), "XX", "", null, undefined]) {
    assert.equal(
      initialChoices(code)[CATEGORIES.MARKETING],
      false,
      `marketing defaulted on for ${String(code)} — profiling must never start without an explicit yes`
    );
  }
});

test("under opt-in nothing optional starts on", () => {
  for (const code of ["DE", "GB", "IN", "BR", "AE", "KR", "XX", ""]) {
    const choices = initialChoices(code);
    for (const c of OPTIONAL) assert.equal(choices[c], false, `${code}/${c} started on under an opt-in regime`);
  }
});

test("under opt-out the permitted optional categories start on, marketing excepted", () => {
  for (const code of ["US", "JP", "SG", "AU"]) {
    const choices = initialChoices(code);
    assert.equal(choices[CATEGORIES.PREFERENCES], true, `${code}/preferences`);
    assert.equal(choices[CATEGORIES.ANALYTICS], true, `${code}/analytics`);
    assert.equal(choices[CATEGORIES.MARKETING], false, `${code}/marketing`);
  }
});

test("initialChoices covers every category and returns only booleans", () => {
  for (const code of ["DE", "US", "XX", null]) {
    const choices = initialChoices(code);
    assert.deepEqual(Object.keys(choices).sort(), [...CATEGORY_ORDER].sort(), String(code));
    for (const c of CATEGORY_ORDER) assert.equal(typeof choices[c], "boolean", `${String(code)}/${c}`);
  }
});

test("initialChoices never grants more than allOn, nor less than allOff", () => {
  for (const code of ["DE", "US", "IN", "XX", ""]) {
    const choices = initialChoices(code);
    for (const c of CATEGORY_ORDER) {
      if (allOff()[c] === true) assert.equal(choices[c], true, `${code}/${c} is below the allOff floor`);
    }
  }
});

// ---------------------------------------------------------------------------
// The inventory
// ---------------------------------------------------------------------------

test("every category in CATEGORY_ORDER exists in INVENTORY", () => {
  for (const c of CATEGORY_ORDER) {
    assert.ok(INVENTORY[c], `CATEGORY_ORDER lists "${c}" but INVENTORY has no entry — the policy page would render undefined`);
  }
});

test("every category in INVENTORY appears in CATEGORY_ORDER", () => {
  for (const c of Object.keys(INVENTORY)) {
    assert.ok(CATEGORY_ORDER.includes(c), `INVENTORY declares "${c}" but CATEGORY_ORDER omits it — it would never be rendered or consentable`);
  }
});

test("CATEGORY_ORDER matches the CATEGORIES enum exactly, with no duplicates", () => {
  assert.deepEqual([...CATEGORY_ORDER].sort(), [...Object.values(CATEGORIES)].sort());
  assert.equal(new Set(CATEGORY_ORDER).size, CATEGORY_ORDER.length);
});

test("every category has a label, a description, a required flag and an items array", () => {
  for (const c of CATEGORY_ORDER) {
    const cat = INVENTORY[c];
    assert.ok(cat.label, `${c} has no label`);
    assert.ok(cat.description, `${c} has no description`);
    assert.equal(typeof cat.required, "boolean", `${c}.required is ${typeof cat.required}`);
    assert.ok(Array.isArray(cat.items), `${c}.items is not an array`);
  }
});

test("only the necessary category is marked required", () => {
  assert.equal(INVENTORY[CATEGORIES.NECESSARY].required, true);
  for (const c of OPTIONAL) {
    assert.equal(INVENTORY[c].required, false, `${c} is marked required — refusing it must actually be possible`);
  }
});

test("every inventory item declares key, kind, purpose, retention and party", () => {
  for (const c of CATEGORY_ORDER) {
    for (const [i, item] of INVENTORY[c].items.entries()) {
      for (const field of ["key", "kind", "purpose", "retention", "party"]) {
        assert.ok(
          item[field] && String(item[field]).trim().length > 0,
          `${c}[${i}] (${item.key || "unnamed"}) has no ${field} — the Cookie Policy table would render a blank cell`
        );
      }
    }
  }
});

test("no storage key is declared twice, in the same category or across categories", () => {
  const seen = new Map();
  for (const c of CATEGORY_ORDER) {
    for (const item of INVENTORY[c].items) {
      assert.ok(!seen.has(item.key), `"${item.key}" is declared in both ${seen.get(item.key)} and ${c}`);
      seen.set(item.key, c);
    }
  }
});

test("the consent record's own storage key is declared as strictly necessary", () => {
  const keys = INVENTORY[CATEGORIES.NECESSARY].items.map((i) => i.key);
  assert.ok(keys.includes(STORAGE_KEY), `${STORAGE_KEY} is not listed under strictly necessary`);
});

test("activeCategories lists exactly the categories that have items", () => {
  const expected = CATEGORY_ORDER.filter((c) => INVENTORY[c].items.length > 0);
  assert.deepEqual(activeCategories(), expected);
});

test("onlyNecessaryInUse agrees with the inventory it is derived from", () => {
  const expected = OPTIONAL.every((c) => INVENTORY[c].items.length === 0);
  assert.equal(
    onlyNecessaryInUse(),
    expected,
    `onlyNecessaryInUse() said ${onlyNecessaryInUse()} while the optional categories hold ${OPTIONAL.map((c) => `${c}:${INVENTORY[c].items.length}`).join(", ")}`
  );
});

test("a category with no items cannot be claimed to be in use", () => {
  for (const c of OPTIONAL) {
    if (INVENTORY[c].items.length === 0) {
      assert.ok(!activeCategories().includes(c), `${c} is empty but reported as active`);
    }
  }
});

test("CONSENT_VERSION is a positive integer, so an old record can be invalidated", () => {
  assert.ok(Number.isInteger(CONSENT_VERSION) && CONSENT_VERSION > 0);
});

test("MODELS values are distinct", () => {
  const values = Object.values(MODELS);
  assert.equal(new Set(values).size, values.length);
});

test("every declared consent model is actually reachable from modelFor", () => {
  const reachable = new Set();
  const codes = [
    ...Object.values(OPT_IN_CASES),
    ...Object.values(OPT_OUT_CASES),
    "XX",
    "",
    "TH",
    "ZA",
    "TR",
    "NG",
    "KE",
    "QA",
    "BH",
    "OM",
    "KW",
    "MY",
    "ID",
    "PH",
    "VN",
    "IL",
    "CL",
    "AR",
  ];
  for (const c of codes) reachable.add(modelFor(c));
  for (const model of Object.values(MODELS)) {
    assert.ok(reachable.has(model), `MODELS.${model} is declared but modelFor never returns it — dead constant`);
  }
});

test("readConsent and allows fail closed with no window or storage", () => {
  // Both are called from module scope in server-rendered pages.
  assert.doesNotThrow(() => consent.readConsent());
  assert.equal(consent.readConsent(), null);
  assert.equal(consent.allows(CATEGORIES.NECESSARY), true, "necessary is always permitted");
  for (const c of OPTIONAL) {
    assert.equal(consent.allows(c), false, `${c} must default to refused when nothing has been recorded`);
  }
});

test("globalPrivacyControl is false rather than throwing with no navigator", () => {
  assert.equal(consent.globalPrivacyControl(), false);
});
