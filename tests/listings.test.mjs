// lib/listings.js — the directory table and the copy validator.
//
// The boundaries matter here for the same reason as in social.js: copy that is
// one character over gets truncated mid-sentence on someone else's website, and
// the customer finds out after they have pasted it in.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const {
  DIRECTORIES,
  DIRECTORY_ORDER,
  LISTING_KIND,
  LISTING_STATUS,
  directoryById,
  listingStatusStyle,
  priorityOf,
  relevantFor,
  validateListing,
} = await import("../lib/listings.js");

const fill = (n) => "a".repeat(n);
const requiredOf = (dir) => Object.entries(dir.fields).filter(([, s]) => s.required);
const isList = (field) => field === "categories" || field === "features";

/** A minimal, valid copy set for a directory — every required field, nothing over. */
function validCopy(dir) {
  const copy = {};
  for (const [field, spec] of Object.entries(dir.fields)) {
    if (!spec.required) continue;
    copy[field] = isList(field) ? Array.from({ length: Math.min(2, spec.max) }, (_, i) => `item${i}`) : fill(10);
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Table integrity
// ---------------------------------------------------------------------------

test("DIRECTORY_ORDER and DIRECTORIES describe the same set, with no duplicates", () => {
  assert.deepEqual([...DIRECTORY_ORDER].sort(), Object.keys(DIRECTORIES).sort());
  assert.equal(new Set(DIRECTORY_ORDER).size, DIRECTORY_ORDER.length);
});

test("every directory declares the fields the UI and the validator read", () => {
  for (const id of DIRECTORY_ORDER) {
    const dir = DIRECTORIES[id];
    assert.equal(dir.id, id, `${id}.id disagrees with its key`);
    assert.ok(dir.name, `${id} has no name`);
    assert.ok(Object.values(LISTING_KIND).includes(dir.kind), `${id}.kind is "${dir.kind}"`);
    assert.ok(/^https:\/\//.test(dir.url), `${id}.url is ${dir.url}`);
    assert.ok(/^https:\/\//.test(dir.submitUrl), `${id}.submitUrl is ${dir.submitUrl}`);
    assert.equal(typeof dir.dofollow, "boolean", `${id}.dofollow`);
    assert.ok(Array.isArray(dir.assets) && dir.assets.length > 0, `${id} lists no assets`);
    assert.ok(dir.note, `${id} has no note`);
  }
});

test("every directory field has a positive max, a label and a required flag", () => {
  for (const id of DIRECTORY_ORDER) {
    const dir = DIRECTORIES[id];
    assert.ok(Object.keys(dir.fields).length > 0, `${id} has no fields`);
    for (const [field, spec] of Object.entries(dir.fields)) {
      assert.ok(Number.isInteger(spec.max) && spec.max > 0, `${id}.${field}.max is ${spec.max}`);
      assert.ok(spec.label, `${id}.${field} has no label`);
      assert.equal(typeof spec.required, "boolean", `${id}.${field}.required is ${typeof spec.required}`);
    }
  }
});

test("every directory requires at least one field, so a blank submission cannot be marked ready", () => {
  for (const id of DIRECTORY_ORDER) {
    assert.ok(requiredOf(DIRECTORIES[id]).length > 0, `${id} requires nothing`);
  }
});

test("a tagline is always shorter than the description it accompanies", () => {
  for (const id of DIRECTORY_ORDER) {
    const f = DIRECTORIES[id].fields;
    if (f.tagline && f.description) {
      assert.ok(f.tagline.max < f.description.max, `${id}: tagline ${f.tagline.max} vs description ${f.description.max}`);
    }
  }
});

test("directoryById returns null rather than undefined for an unknown id", () => {
  assert.equal(directoryById("yellow_pages"), null);
  assert.equal(directoryById(undefined), null);
  assert.equal(directoryById("g2")?.id, "g2");
});

test("listing statuses are distinct and every one renders a style", () => {
  const values = Object.values(LISTING_STATUS);
  assert.equal(new Set(values).size, values.length);
  for (const s of values) {
    const style = listingStatusStyle(s);
    assert.ok(style.label && style.bg && style.fg, `${s} has an incomplete style`);
  }
  assert.ok(listingStatusStyle(undefined).label, "an unknown status must still render");
});

// ---------------------------------------------------------------------------
// Field boundaries
// ---------------------------------------------------------------------------

for (const id of DIRECTORY_ORDER) {
  const dir = DIRECTORIES[id];

  test(`${id}: every field at exactly its limit is accepted`, () => {
    const copy = {};
    for (const [field, spec] of Object.entries(dir.fields)) {
      copy[field] = isList(field) ? Array.from({ length: spec.max }, (_, i) => `item${i}`) : fill(spec.max);
    }
    assert.deepEqual(validateListing(id, copy), [], `${id} rejected copy at exactly its limits`);
  });

  test(`${id}: every field one over its limit is refused, and says by how much`, () => {
    for (const [field, spec] of Object.entries(dir.fields)) {
      const copy = { ...validCopy(dir) };
      copy[field] = isList(field) ? Array.from({ length: spec.max + 1 }, (_, i) => `item${i}`) : fill(spec.max + 1);
      const problems = validateListing(id, copy);
      assert.equal(problems.length, 1, `${id}.${field}: ${JSON.stringify(problems)}`);
      assert.match(problems[0], new RegExp(spec.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), problems[0]);
      assert.match(problems[0], new RegExp(String(spec.max)), `${id}.${field} did not name the limit: ${problems[0]}`);
      if (!isList(field)) {
        assert.match(problems[0], /\b1 character\b/, `${id}.${field}: ${problems[0]}`);
      }
    }
  });

  test(`${id}: every field one under its limit is accepted`, () => {
    const copy = {};
    for (const [field, spec] of Object.entries(dir.fields)) {
      copy[field] = isList(field)
        ? Array.from({ length: Math.max(1, spec.max - 1) }, (_, i) => `item${i}`)
        : fill(spec.max - 1);
    }
    assert.deepEqual(validateListing(id, copy), [], `${id}: ${JSON.stringify(validateListing(id, copy))}`);
  });

  test(`${id}: every required field missing is reported by name`, () => {
    const problems = validateListing(id, {});
    assert.equal(problems.length, requiredOf(dir).length, `${id}: ${JSON.stringify(problems)}`);
    for (const [, spec] of requiredOf(dir)) {
      assert.ok(
        problems.some((p) => p.includes(spec.label.toLowerCase())),
        `${id} did not report "${spec.label}" as missing: ${JSON.stringify(problems)}`
      );
    }
  });

  test(`${id}: optional fields left out are not reported as missing`, () => {
    assert.deepEqual(validateListing(id, validCopy(dir)), [], `${id}: ${JSON.stringify(validateListing(id, validCopy(dir)))}`);
  });
}

test("an empty string in a required field counts as missing, not as valid copy", () => {
  const problems = validateListing("product_hunt", { tagline: "", description: "" });
  assert.equal(problems.length, 2, JSON.stringify(problems));
  for (const p of problems) assert.match(p, /requires/, p);
});

test("an empty array in a required list field counts as missing", () => {
  const problems = validateListing("g2", { tagline: "Short.", description: "Long.", categories: [] });
  assert.ok(problems.some((p) => /requires categories/i.test(p)), JSON.stringify(problems));
});

test("the over-limit message counts the exact overshoot", () => {
  const problems = validateListing("product_hunt", { tagline: fill(85), description: "ok" });
  assert.match(problems[0], /\b25 characters over\b/, problems[0]);
  assert.match(problems[0], /Product Hunt/, problems[0]);
});

test("a list field over its limit names both counts", () => {
  const problems = validateListing("g2", {
    tagline: "Short.",
    description: "Long.",
    categories: ["a", "b", "c", "d", "e"],
  });
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /5 given/, problems[0]);
  assert.match(problems[0], /allows 3/, problems[0]);
});

test("an unknown directory is refused by name", () => {
  const problems = validateListing("yellow_pages", { tagline: "x" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /yellow_pages/);
  assert.equal(validateListing(undefined, {}).length, 1);
});

test("validateListing does not throw on missing, null or oddly typed copy", () => {
  for (const copy of [undefined, {}, { tagline: null }, { tagline: 12345 }, { tagline: {} }, { description: [] }]) {
    assert.doesNotThrow(() => validateListing("saashub", copy), JSON.stringify(copy));
    for (const p of validateListing("saashub", copy)) {
      assert.ok(typeof p === "string" && p.trim().length > 0, `${JSON.stringify(copy)} -> ${p}`);
    }
  }
});

test("validateListing never reports the same field twice", () => {
  const problems = validateListing("capterra", { tagline: fill(500), description: fill(5000), features: new Array(50).fill("f") });
  assert.equal(new Set(problems).size, problems.length, JSON.stringify(problems));
});

test("validateListing reports every fault, not just the first", () => {
  const problems = validateListing("capterra", { tagline: fill(500), description: fill(5000) });
  assert.equal(problems.length, 2, JSON.stringify(problems));
});

// ---------------------------------------------------------------------------
// relevantFor
// ---------------------------------------------------------------------------

test("relevantFor with nothing known hides the directories that would reject the customer", () => {
  const ids = relevantFor().map((d) => d.id);
  assert.ok(!ids.includes("theresanaiforthat"), "an AI directory was suggested to a business with no AI signal");
  assert.ok(!ids.includes("clutch"), "an agency directory was suggested to a non-agency");
  assert.ok(!ids.includes("betalist"), "an early-stage-only launch site was suggested to an established product");
  assert.deepEqual(relevantFor({}).map((d) => d.id), ids, "an empty object and no argument must agree");
});

test("relevantFor returns every directory when every flag is set", () => {
  assert.deepEqual(relevantFor({ isAI: true, isAgency: true, isEarlyStage: true }).map((d) => d.id), DIRECTORY_ORDER);
});

test("each flag unlocks exactly the directory it gates", () => {
  assert.ok(relevantFor({ isAI: true }).map((d) => d.id).includes("theresanaiforthat"));
  assert.ok(!relevantFor({ isAI: true }).map((d) => d.id).includes("clutch"));
  assert.ok(relevantFor({ isAgency: true }).map((d) => d.id).includes("clutch"));
  assert.ok(relevantFor({ isEarlyStage: true }).map((d) => d.id).includes("betalist"));
});

test("relevantFor preserves DIRECTORY_ORDER", () => {
  const ids = relevantFor({ isAI: true, isAgency: true, isEarlyStage: true }).map((d) => d.id);
  const filtered = relevantFor({ isAI: true }).map((d) => d.id);
  assert.deepEqual(filtered, ids.filter((id) => filtered.includes(id)));
});

test("relevantFor returns the directory objects themselves, not copies missing their fields", () => {
  for (const d of relevantFor({ isAI: true, isAgency: true, isEarlyStage: true })) {
    assert.equal(d, DIRECTORIES[d.id], `${d.id} is not the same object`);
  }
});

test("every gated directory declares the flag that gates it", () => {
  assert.equal(DIRECTORIES.theresanaiforthat.onlyIf, "ai");
  assert.equal(DIRECTORIES.clutch.onlyIf, "agency");
  for (const id of DIRECTORY_ORDER) {
    const onlyIf = DIRECTORIES[id].onlyIf;
    if (onlyIf) assert.ok(["ai", "agency"].includes(onlyIf), `${id}.onlyIf is "${onlyIf}", which relevantFor does not handle`);
  }
});

// ---------------------------------------------------------------------------
// priorityOf
// ---------------------------------------------------------------------------

test("priorityOf ranks a free followed link first", () => {
  assert.equal(priorityOf(DIRECTORIES.saashub), 1);
  assert.equal(priorityOf(DIRECTORIES.alternativeto), 1);
});

test("priorityOf returns a positive integer for every directory", () => {
  for (const id of DIRECTORY_ORDER) {
    const p = priorityOf(DIRECTORIES[id]);
    assert.ok(Number.isInteger(p) && p >= 1 && p <= 4, `${id} ranked ${p}`);
  }
});

test("priorityOf does not throw on a partial directory object", () => {
  assert.doesNotThrow(() => priorityOf({}));
  assert.equal(priorityOf({}), 4);
});

test("a one-shot directory is flagged, so it is never re-submitted", () => {
  assert.equal(DIRECTORIES.product_hunt.oneShot, true);
  assert.equal(DIRECTORIES.betalist.oneShot, true);
  for (const id of DIRECTORY_ORDER) {
    if (DIRECTORIES[id].oneShot) {
      assert.equal(DIRECTORIES[id].kind, LISTING_KIND.LAUNCH, `${id} is one-shot but not a launch`);
    }
  }
});
