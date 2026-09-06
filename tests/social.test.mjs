// lib/social.js — what each network will actually accept.
//
// This file concentrates on the boundaries: an empty post, a post at exactly the
// limit, one character over, an Instagram post with no image, and a post that is
// nothing but a link. Those are the drafts that get through a naive counter and
// are then rejected by the network at publish time, when the customer has
// already approved them.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const {
  NETWORKS,
  NETWORK_ORDER,
  POST_STATUS,
  POST_TERMINAL,
  anyNetworkConfigured,
  charLimitFor,
  effectiveLength,
  networkById,
  postStatusStyle,
  readiness,
  validatePost,
} = await import("../lib/social.js");

const fill = (n, ch = "a") => ch.repeat(n);

// ---------------------------------------------------------------------------
// Table integrity
// ---------------------------------------------------------------------------

test("NETWORK_ORDER and NETWORKS describe the same set", () => {
  assert.deepEqual([...NETWORK_ORDER].sort(), Object.keys(NETWORKS).sort());
  assert.equal(new Set(NETWORK_ORDER).size, NETWORK_ORDER.length);
});

test("every network declares the fields the validator reads", () => {
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    assert.equal(net.id, id, `${id}.id disagrees with its key`);
    assert.ok(net.label, `${id} has no label`);
    assert.ok(Number.isInteger(net.maxChars) && net.maxChars > 0, `${id}.maxChars is ${net.maxChars}`);
    assert.equal(typeof net.imageRequired, "boolean", `${id}.imageRequired`);
    assert.ok(Number.isInteger(net.maxImages) && net.maxImages > 0, `${id}.maxImages is ${net.maxImages}`);
    assert.ok(net.hashtags && Number.isInteger(net.hashtags.max), `${id}.hashtags.max is missing`);
    assert.ok(net.hashtags.advised <= net.hashtags.max, `${id} advises more hashtags than it tolerates`);
    assert.equal(typeof net.linksOk, "boolean", `${id}.linksOk`);
    assert.ok(Array.isArray(net.envKeys) && net.envKeys.length > 0, `${id}.envKeys is empty`);
    assert.ok(net.setupUrl && net.setupNote, `${id} has no setup guidance`);
  }
});

test("networkById returns null rather than undefined for an unknown network", () => {
  assert.equal(networkById("tiktok"), null);
  assert.equal(networkById(undefined), null);
  assert.equal(networkById("linkedin")?.id, "linkedin");
});

test("post statuses are distinct and every one renders a style", () => {
  const values = Object.values(POST_STATUS);
  assert.equal(new Set(values).size, values.length);
  for (const s of values) {
    const style = postStatusStyle(s);
    assert.ok(style.label && style.bg && style.fg, `${s} has an incomplete style`);
  }
  assert.ok(postStatusStyle(undefined).label, "an unknown status must still render");
});

test("the terminal statuses are a subset of the declared statuses", () => {
  for (const s of POST_TERMINAL) assert.ok(Object.values(POST_STATUS).includes(s), `${s} is not a declared status`);
  assert.ok(!POST_TERMINAL.includes(POST_STATUS.DRAFTED), "a draft must never be terminal");
  assert.ok(!POST_TERMINAL.includes(POST_STATUS.FAILED), "a failure must be retryable");
});

// ---------------------------------------------------------------------------
// Empty posts
// ---------------------------------------------------------------------------

test("an empty post is rejected on every network that allows text", () => {
  for (const id of NETWORK_ORDER) {
    const problems = validatePost({ networkId: id, text: "" });
    assert.ok(problems.some((p) => /empty/i.test(p)), `${id} accepted an empty post: ${JSON.stringify(problems)}`);
  }
});

test("a whitespace-only post is rejected as empty, not accepted as content", () => {
  for (const id of NETWORK_ORDER) {
    const problems = validatePost({ networkId: id, text: "   \n\t  " });
    assert.ok(problems.some((p) => /empty/i.test(p)), `${id} accepted whitespace: ${JSON.stringify(problems)}`);
  }
});

test("a missing text field is treated as empty rather than throwing", () => {
  for (const id of NETWORK_ORDER) {
    assert.doesNotThrow(() => validatePost({ networkId: id }), id);
    assert.ok(validatePost({ networkId: id }).length > 0, `${id} accepted a post with no text field`);
  }
});

test("an unknown network is refused by name", () => {
  const problems = validatePost({ networkId: "tiktok", text: "hello" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /tiktok/);
  assert.deepEqual(validatePost({ networkId: undefined, text: "hi" }).length, 1);
});

// ---------------------------------------------------------------------------
// Length boundaries
// ---------------------------------------------------------------------------

for (const id of NETWORK_ORDER) {
  const net = NETWORKS[id];
  const images = net.imageRequired ? ["https://cdn/x.jpg"] : [];

  test(`${id}: a post of exactly ${net.maxChars} characters is accepted`, () => {
    const problems = validatePost({ networkId: id, text: fill(net.maxChars), images });
    assert.deepEqual(problems, [], `${id} rejected a post at exactly its limit`);
  });

  test(`${id}: a post one character over the limit is rejected, and says by how much`, () => {
    const problems = validatePost({ networkId: id, text: fill(net.maxChars + 1), images });
    assert.equal(problems.length, 1, `${id}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], new RegExp(`\\b1 character\\b`), `${id} said: ${problems[0]}`);
    assert.match(problems[0], new RegExp(String(net.maxChars)), `${id} did not name the limit: ${problems[0]}`);
  });

  test(`${id}: a post one character under the limit is accepted`, () => {
    assert.deepEqual(validatePost({ networkId: id, text: fill(net.maxChars - 1), images }), []);
  });
}

test("the over-limit message counts the exact overshoot", () => {
  const problems = validatePost({ networkId: "x", text: fill(300) });
  assert.match(problems[0], /\b20 characters over\b/, `message was: ${problems[0]}`);
});

test("leading and trailing whitespace is not counted against the limit", () => {
  assert.deepEqual(validatePost({ networkId: "x", text: `   ${fill(280)}   ` }), [], "trimmed text should fit");
});

// ---------------------------------------------------------------------------
// X: links cost a flat 23 characters
// ---------------------------------------------------------------------------

test("effectiveLength bills an X link at the flat t.co cost however long it is", () => {
  assert.equal(effectiveLength("https://x.co", "x"), 23, "a short link still costs 23");
  const longUrl = `https://example.com/${fill(200, "p")}`;
  assert.equal(effectiveLength(longUrl, "x"), 23, "a 220-character link still costs 23");
  assert.equal(effectiveLength(`hello ${longUrl}`, "x"), 6 + 23);
});

test("effectiveLength bills two links at 46, not at their real length", () => {
  assert.equal(effectiveLength("https://a.example https://b.example", "x"), 23 + 1 + 23);
});

test("effectiveLength is plain string length on networks with no link cost", () => {
  for (const id of ["linkedin", "instagram", "facebook"]) {
    const text = "see https://example.com/very/long/path/indeed";
    assert.equal(effectiveLength(text, id), text.length, id);
  }
});

test("effectiveLength does not throw on an unknown network or empty input", () => {
  assert.equal(effectiveLength("hello", "tiktok"), 5);
  assert.equal(effectiveLength("", "x"), 0);
  assert.equal(effectiveLength(undefined, "x"), 0);
  assert.equal(effectiveLength(null, "x"), 0);
});

test("an X post that is only a link is valid and is not read as empty", () => {
  assert.deepEqual(validatePost({ networkId: "x", text: "https://madbot.example/launch" }), []);
});

test("an X post that is only a very long link is still valid", () => {
  const url = `https://madbot.example/${fill(400, "z")}`;
  assert.equal(url.length > 280, true, "the raw URL must be longer than the limit for this test to mean anything");
  assert.deepEqual(validatePost({ networkId: "x", text: url }), [], "a long URL must not be counted at its real length");
});

test("an X post at exactly 280 effective characters is accepted", () => {
  const text = `${fill(256)} https://madbot.example/launch`;
  assert.equal(effectiveLength(text, "x"), 280, `effective length was ${effectiveLength(text, "x")}`);
  assert.ok(text.length > 280, "the raw string must be over the limit for this test to mean anything");
  assert.deepEqual(validatePost({ networkId: "x", text }), []);
});

test("an X post one effective character over 280 is rejected, and the message explains the link cost", () => {
  const text = `${fill(257)} https://madbot.example/launch`;
  assert.equal(effectiveLength(text, "x"), 281);
  const problems = validatePost({ networkId: "x", text });
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /1 character/, problems[0]);
  assert.match(problems[0], /every link counts as 23/, problems[0]);
});

test("a premium X account gets the larger limit", () => {
  assert.equal(charLimitFor("x", { premium: true }), NETWORKS.x.maxCharsPremium);
  assert.equal(charLimitFor("x"), 280);
  assert.deepEqual(validatePost({ networkId: "x", text: fill(1000), premium: true }), []);
  assert.equal(validatePost({ networkId: "x", text: fill(1000) }).length, 1, "a non-premium account must still be held to 280");
});

test("premium does not raise the limit on a network with no premium tier", () => {
  assert.equal(charLimitFor("linkedin", { premium: true }), NETWORKS.linkedin.maxChars);
});

test("charLimitFor returns 0 rather than undefined for an unknown network", () => {
  assert.equal(charLimitFor("tiktok"), 0);
  assert.equal(charLimitFor(undefined), 0);
});

// ---------------------------------------------------------------------------
// Instagram: no text-only post
// ---------------------------------------------------------------------------

test("an Instagram post with text but no image is refused, and says why", () => {
  const problems = validatePost({ networkId: "instagram", text: "A perfectly good caption." });
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /no text-only post/i, problems[0]);
});

test("an Instagram post with no image and no text reports both faults", () => {
  const problems = validatePost({ networkId: "instagram", text: "" });
  assert.ok(problems.some((p) => /empty/i.test(p)), JSON.stringify(problems));
  assert.ok(problems.some((p) => /no text-only post/i.test(p)), JSON.stringify(problems));
});

test("an Instagram post with an image and an empty caption is valid", () => {
  assert.deepEqual(validatePost({ networkId: "instagram", text: "", images: ["https://cdn/x.jpg"] }), []);
});

test("an Instagram post with an image and a caption is valid", () => {
  assert.deepEqual(validatePost({ networkId: "instagram", text: "Caption.", images: ["https://cdn/x.jpg"] }), []);
});

test("a link in an Instagram caption is flagged as unclickable", () => {
  const problems = validatePost({
    networkId: "instagram",
    text: "Read more at https://madbot.example",
    images: ["https://cdn/x.jpg"],
  });
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /does not render links/i, problems[0]);
});

test("an Instagram post that is nothing but a link is refused for the link and passes the empty check", () => {
  const problems = validatePost({ networkId: "instagram", text: "https://madbot.example", images: ["https://cdn/x.jpg"] });
  assert.ok(problems.some((p) => /does not render links/i.test(p)), JSON.stringify(problems));
  assert.ok(!problems.some((p) => /empty/i.test(p)), "a link is content, not emptiness");
});

test("links are permitted on the networks that render them", () => {
  for (const id of ["linkedin", "x", "facebook"]) {
    const problems = validatePost({ networkId: id, text: "Read more at https://madbot.example" });
    assert.deepEqual(problems, [], `${id} refused a link: ${JSON.stringify(problems)}`);
  }
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

test("exactly the maximum number of images is accepted on every network", () => {
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    const problems = validatePost({ networkId: id, text: "Hello.", images: new Array(net.maxImages).fill("https://cdn/x.jpg") });
    assert.deepEqual(problems, [], `${id} rejected ${net.maxImages} images: ${JSON.stringify(problems)}`);
  }
});

test("one image over the maximum is refused, naming both numbers", () => {
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    const images = new Array(net.maxImages + 1).fill("https://cdn/x.jpg");
    const problems = validatePost({ networkId: id, text: "Hello.", images });
    assert.equal(problems.length, 1, `${id}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], new RegExp(`${net.maxImages} images`), problems[0]);
    assert.match(problems[0], new RegExp(`has ${images.length}`), problems[0]);
  }
});

test("an image-only post is accepted on every network that supports images", () => {
  // X, LinkedIn and Facebook all publish an image with no commentary.
  for (const id of NETWORK_ORDER) {
    if (!NETWORKS[id].imageSupported) continue;
    const problems = validatePost({ networkId: id, text: "", images: ["https://cdn/x.jpg"] });
    assert.deepEqual(problems, [], `${id} refused an image-only post: ${JSON.stringify(problems)}`);
  }
});

test("a non-array images value does not throw", () => {
  for (const value of [undefined, null, 0, "one"]) {
    assert.doesNotThrow(() => validatePost({ networkId: "linkedin", text: "Hi.", images: value }), String(value));
  }
});

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

test("exactly the tolerated number of hashtags is accepted", () => {
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    const tags = Array.from({ length: net.hashtags.max }, (_, i) => `#tag${i}`).join(" ");
    const images = net.imageRequired ? ["https://cdn/x.jpg"] : [];
    assert.deepEqual(validatePost({ networkId: id, text: `Hello. ${tags}`, images }), [], `${id} with ${net.hashtags.max} tags`);
  }
});

test("one hashtag too many is refused, naming both counts", () => {
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    const n = net.hashtags.max + 1;
    const tags = Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
    const images = net.imageRequired ? ["https://cdn/x.jpg"] : [];
    const problems = validatePost({ networkId: id, text: `Hello. ${tags}`, images });
    assert.ok(problems.some((p) => p.includes(`${n} hashtags`)), `${id}: ${JSON.stringify(problems)}`);
  }
});

test("hashtags with accents and non-Latin scripts are counted", () => {
  const problems = validatePost({ networkId: "x", text: "Hi #café #日本語 #tres" });
  assert.ok(problems.some((p) => /3 hashtags/.test(p)), JSON.stringify(problems));
});

test("a bare hash or a hash inside a URL fragment is not counted as a hashtag", () => {
  assert.deepEqual(validatePost({ networkId: "x", text: "Hi # there" }), []);
});

// ---------------------------------------------------------------------------
// Several faults at once
// ---------------------------------------------------------------------------

test("a draft with several faults reports all of them, not just the first", () => {
  const problems = validatePost({
    networkId: "instagram",
    text: `${fill(2300)} https://madbot.example ${Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")}`,
    images: new Array(11).fill("https://cdn/x.jpg"),
  });
  assert.ok(problems.length >= 4, `only ${problems.length} problems reported: ${JSON.stringify(problems)}`);
});

test("validatePost always returns an array of non-empty strings", () => {
  const cases = [
    { networkId: "linkedin", text: "" },
    { networkId: "x", text: fill(500) },
    { networkId: "instagram", text: "hi" },
    { networkId: "nope", text: "hi" },
    {},
  ];
  for (const c of cases) {
    const problems = validatePost(c);
    assert.ok(Array.isArray(problems), JSON.stringify(c));
    for (const p of problems) assert.ok(typeof p === "string" && p.trim().length > 0, `${JSON.stringify(c)} -> ${p}`);
  }
});

// ---------------------------------------------------------------------------
// readiness
// ---------------------------------------------------------------------------

test("readiness reports every network as unconfigured against an empty env", () => {
  const r = readiness({});
  assert.deepEqual(Object.keys(r).sort(), [...NETWORK_ORDER].sort());
  for (const id of NETWORK_ORDER) {
    assert.equal(r[id].configured, false, `${id}`);
    assert.deepEqual(r[id].missing, NETWORKS[id].envKeys, `${id} missing list`);
    assert.ok(r[id].setupUrl && r[id].setupNote, `${id} offers no way forward`);
  }
});

test("readiness reports a network as configured only when every key is present", () => {
  const partial = { META_APP_ID: "x" };
  assert.equal(readiness(partial).instagram.configured, false, "one of two keys is not configured");
  assert.deepEqual(readiness(partial).instagram.missing, ["META_APP_SECRET"]);
  const full = { META_APP_ID: "x", META_APP_SECRET: "y" };
  assert.equal(readiness(full).instagram.configured, true);
  assert.equal(readiness(full).facebook.configured, true, "Instagram and Facebook share the Meta app");
  assert.equal(readiness(full).linkedin.configured, false);
});

test("readiness treats an empty-string credential as missing", () => {
  assert.equal(readiness({ META_APP_ID: "", META_APP_SECRET: "" }).instagram.configured, false);
});

test("anyNetworkConfigured is false on an empty env and true once one network is complete", () => {
  assert.equal(anyNetworkConfigured({}), false);
  assert.equal(anyNetworkConfigured(), false);
  assert.equal(anyNetworkConfigured({ X_CLIENT_ID: "a" }), false);
  assert.equal(anyNetworkConfigured({ X_CLIENT_ID: "a", X_CLIENT_SECRET: "b" }), true);
});

test("readiness never mutates the env it is handed", () => {
  const env = { META_APP_ID: "x" };
  readiness(env);
  assert.deepEqual(env, { META_APP_ID: "x" });
});
