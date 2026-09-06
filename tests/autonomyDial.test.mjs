// lib/autonomyDial.js — the dial's geometry.
//
// The knob-on-the-arc test is the regression guard the module's own header asks
// for: the landing page once positioned the knob by hand and it sat visibly off
// its track. Anything that computes the knob's position from something other
// than DIAL.r puts it back off the arc, and the assertion below catches it.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./_register.mjs";

const { AUTONOMY_BANDS, PLANS, autonomyLabel } = await import("../lib/plans.js");
const { DIAL, arcDash, bandIndex, bandInfo, bands, clampValue, knobPoint, trackDash, valueFromPointer } = await import(
  "../lib/autonomyDial.js"
);

const EPSILON = 1e-9;
const dist = (p) => Math.hypot(p.x - DIAL.cx, p.y - DIAL.cy);

// ---------------------------------------------------------------------------
// knobPoint — the one that regressed once
// ---------------------------------------------------------------------------

for (const value of [0, 1, 50, 99, 100]) {
  test(`knobPoint(${value}) lands exactly on the arc radius`, () => {
    const p = knobPoint(value);
    assert.ok(
      Math.abs(dist(p) - DIAL.r) < EPSILON,
      `knob for ${value} sits ${dist(p).toFixed(6)} from the centre, arc radius is ${DIAL.r} (off by ${(dist(p) - DIAL.r).toExponential(2)})`
    );
  });
}

test("knobPoint lands on the arc for every integer value from 0 to 100", () => {
  for (let v = 0; v <= 100; v += 1) {
    const p = knobPoint(v);
    assert.ok(Math.abs(dist(p) - DIAL.r) < EPSILON, `value ${v} is ${dist(p)} from centre, expected ${DIAL.r}`);
  }
});

test("knobPoint stays on the arc for out-of-range and junk values", () => {
  for (const v of [-50, 101, 1e9, NaN, undefined, null, "abc", "72", {}]) {
    const p = knobPoint(v);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `knobPoint(${String(v)}) returned ${JSON.stringify(p)}`);
    assert.ok(Math.abs(dist(p) - DIAL.r) < EPSILON, `knobPoint(${String(v)}) is ${dist(p)} from centre`);
  }
});

test("knobPoint(0) is bottom-left and knobPoint(100) is bottom-right, mirrored about the centre line", () => {
  const start = knobPoint(0);
  const end = knobPoint(100);
  assert.ok(start.x < DIAL.cx, `start x ${start.x} is not left of centre`);
  assert.ok(end.x > DIAL.cx, `end x ${end.x} is not right of centre`);
  assert.ok(start.y > DIAL.cy && end.y > DIAL.cy, "both ends must be below the centre on a bottom-open gauge");
  assert.ok(Math.abs((DIAL.cx - start.x) - (end.x - DIAL.cx)) < 1e-9, "the two ends are not symmetric");
  assert.ok(Math.abs(start.y - end.y) < 1e-9, "the two ends are not level");
});

test("knobPoint(50) sits at the top of the dial", () => {
  const p = knobPoint(50);
  assert.ok(Math.abs(p.x - DIAL.cx) < 1e-9, `x was ${p.x}, expected ${DIAL.cx}`);
  assert.ok(Math.abs(p.y - (DIAL.cy - DIAL.r)) < 1e-9, `y was ${p.y}, expected ${DIAL.cy - DIAL.r}`);
});

test("knobPoint advances monotonically along the sweep", () => {
  let previous = -Infinity;
  for (let v = 0; v <= 100; v += 1) {
    const deg = DIAL.startDeg + v * (DIAL.sweepDeg / 100);
    assert.ok(deg > previous, `angle did not advance at ${v}`);
    previous = deg;
  }
  assert.equal(DIAL.startDeg + 100 * (DIAL.sweepDeg / 100), DIAL.startDeg + DIAL.sweepDeg);
});

test("the knob fits inside the viewBox at every value", () => {
  const pad = DIAL.knob / 2;
  for (let v = 0; v <= 100; v += 1) {
    const p = knobPoint(v);
    assert.ok(p.x - pad >= 0 && p.x + pad <= DIAL.size, `value ${v}: x ${p.x} escapes the ${DIAL.size}-unit box`);
    assert.ok(p.y - pad >= 0 && p.y + pad <= DIAL.size, `value ${v}: y ${p.y} escapes the ${DIAL.size}-unit box`);
  }
});

test("DIAL's geometry is self-consistent", () => {
  assert.equal(DIAL.cx, DIAL.size / 2);
  assert.equal(DIAL.cy, DIAL.size / 2);
  assert.ok(DIAL.r + DIAL.stroke / 2 <= DIAL.size / 2, "the stroke overflows the viewBox");
  assert.equal(DIAL.startDeg + DIAL.sweepDeg, 405, "a 270 degree gauge opening at the bottom must run 135 to 405");
});

// ---------------------------------------------------------------------------
// clampValue
// ---------------------------------------------------------------------------

test("clampValue pins negatives to zero", () => {
  for (const v of [-1, -0.4, -100, -1e9, "-40", Number.MIN_SAFE_INTEGER]) {
    assert.equal(clampValue(v), 0, `clampValue(${String(v)})`);
  }
});

test("clampValue pins anything above 100 to 100", () => {
  for (const v of [101, 100.4, 1e9, "250", Number.MAX_SAFE_INTEGER, Infinity]) {
    const got = clampValue(v);
    assert.ok(got <= 100, `clampValue(${String(v)}) = ${got}`);
  }
  assert.equal(clampValue(101), 100);
  assert.equal(clampValue("250"), 100);
});

test("clampValue fails safe to zero for NaN, undefined and unparseable strings", () => {
  for (const v of [NaN, undefined, "abc", "", {}, [], "12abc", Symbol ? "NaN" : "NaN"]) {
    const got = clampValue(v);
    assert.ok(got >= 0 && got <= 100, `clampValue(${String(v)}) = ${got} is out of range`);
  }
  assert.equal(clampValue(NaN), 0);
  assert.equal(clampValue(undefined), 0);
  assert.equal(clampValue("abc"), 0);
  assert.equal(clampValue({}), 0);
});

test("clampValue rounds to a whole number and accepts numeric strings", () => {
  assert.equal(clampValue("63"), 63);
  assert.equal(clampValue(63.4), 63);
  assert.equal(clampValue(63.6), 64);
  assert.equal(clampValue(null), 0);
  assert.equal(clampValue([]), 0, "an empty array coerces to 0");
});

test("clampValue always returns an integer in 0-100 for a wide sweep", () => {
  for (const v of [-1e9, -1, 0, 0.5, 24, 47, 79, 100, 100.5, 1e9, "0", "100", NaN, undefined, null, true, false]) {
    const got = clampValue(v);
    assert.ok(Number.isInteger(got), `clampValue(${String(v)}) = ${got} is not an integer`);
    assert.ok(got >= 0 && got <= 100, `clampValue(${String(v)}) = ${got}`);
  }
});

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

test("band boundaries are contiguous with no gap and no overlap", () => {
  const all = bands();
  assert.equal(all[0].min, 0, "the first band must start at 0");
  assert.equal(all[all.length - 1].max, 100, "the last band must end at 100");
  for (let i = 1; i < all.length; i += 1) {
    assert.equal(
      all[i].min,
      all[i - 1].max + 1,
      `gap or overlap between "${all[i - 1].label}" (ends ${all[i - 1].max}) and "${all[i].label}" (starts ${all[i].min})`
    );
  }
});

test("every value from 0 to 100 falls in exactly one band", () => {
  const all = bands();
  for (let v = 0; v <= 100; v += 1) {
    const hits = all.filter((b) => v >= b.min && v <= b.max);
    assert.equal(hits.length, 1, `value ${v} falls in ${hits.length} bands (${hits.map((b) => b.label).join(", ")})`);
    assert.equal(bandIndex(v), all.indexOf(hits[0]), `bandIndex(${v}) disagrees with the band table`);
  }
});

test("every band's midpoint lies inside that band", () => {
  for (const b of bands()) {
    assert.ok(b.mid >= b.min && b.mid <= b.max, `"${b.label}" has mid ${b.mid} outside ${b.min}-${b.max}`);
    assert.equal(bandIndex(b.mid), b.index, `jumping to "${b.label}" via its midpoint lands in band ${bandIndex(b.mid)}`);
  }
});

test("bands() matches AUTONOMY_BANDS one for one", () => {
  const all = bands();
  assert.equal(all.length, AUTONOMY_BANDS.length);
  for (const [i, b] of all.entries()) {
    assert.equal(b.label, AUTONOMY_BANDS[i].label, `band ${i} label`);
    assert.equal(b.max, AUTONOMY_BANDS[i].max, `band ${i} ceiling`);
    assert.equal(b.index, i);
  }
});

test("every band carries copy — no band falls back to a bare label with no description", () => {
  for (const b of bands()) {
    assert.ok(b.short && b.short.length > 0, `"${b.label}" has no short form`);
    assert.ok(b.desc && b.desc.length > 0, `"${b.label}" has no description — BAND_COPY is missing a key`);
  }
});

test("bandInfo agrees with autonomyLabel at every value", () => {
  for (let v = 0; v <= 100; v += 1) {
    assert.equal(bandInfo(v).label, autonomyLabel(v), `value ${v}`);
  }
});

test("bandInfo does not throw and stays in range for junk input", () => {
  for (const v of [-1, 101, NaN, undefined, null, "abc", {}, Infinity, -Infinity]) {
    let info;
    assert.doesNotThrow(() => {
      info = bandInfo(v);
    }, String(v));
    assert.ok(info.index >= 0 && info.index < AUTONOMY_BANDS.length, `bandInfo(${String(v)}).index = ${info.index}`);
    assert.ok(info.label && info.short && info.desc, `bandInfo(${String(v)}) has missing copy`);
  }
});

test("junk input lands in the safest band, not the most permissive one", () => {
  for (const v of [NaN, undefined, "abc", null]) {
    assert.equal(bandInfo(v).index, 0, `bandInfo(${String(v)}) landed in band ${bandInfo(v).index}`);
  }
});

test("every plan cap sits exactly at a band ceiling and reads as that band", () => {
  for (const plan of Object.values(PLANS)) {
    const info = bandInfo(plan.maxAutonomy);
    assert.equal(
      info.max,
      plan.maxAutonomy,
      `${plan.id} caps at ${plan.maxAutonomy}, which is mid-band "${info.label}" (${info.max}) — the dial would offer a label the plan cannot reach`
    );
  }
});

// ---------------------------------------------------------------------------
// valueFromPointer
// ---------------------------------------------------------------------------

const RECT = { left: 0, top: 0, width: DIAL.size, height: DIAL.size };
const pointAt = (value) => {
  const deg = DIAL.startDeg + value * (DIAL.sweepDeg / 100);
  const a = (deg * Math.PI) / 180;
  return { clientX: DIAL.cx + DIAL.r * Math.cos(a), clientY: DIAL.cy + DIAL.r * Math.sin(a) };
};

test("valueFromPointer round-trips every value the knob can be drawn at", () => {
  for (let v = 0; v <= 100; v += 1) {
    const { clientX, clientY } = pointAt(v);
    assert.equal(valueFromPointer(clientX, clientY, RECT), v, `pointer at the knob for ${v} read back differently`);
  }
});

test("valueFromPointer reads the same value at any distance along the same ray", () => {
  for (const v of [0, 25, 50, 75, 100]) {
    const deg = ((DIAL.startDeg + v * (DIAL.sweepDeg / 100)) * Math.PI) / 180;
    for (const radius of [30, 152, 400]) {
      const x = DIAL.cx + radius * Math.cos(deg);
      const y = DIAL.cy + radius * Math.sin(deg);
      assert.equal(valueFromPointer(x, y, RECT), v, `value ${v} at radius ${radius}`);
    }
  }
});

test("dragging past Full send holds at 100 instead of wrapping round to Watch", () => {
  // The 90 degree dead zone at the bottom. Just clockwise of the 45 degree end.
  for (const overshoot of [1, 10, 30, 44]) {
    const deg = ((45 + overshoot) * Math.PI) / 180;
    const x = DIAL.cx + DIAL.r * Math.cos(deg);
    const y = DIAL.cy + DIAL.r * Math.sin(deg);
    assert.equal(
      valueFromPointer(x, y, RECT),
      100,
      `${overshoot} degrees past the end wrapped to ${valueFromPointer(x, y, RECT)} — a dial must not behave like a roulette wheel`
    );
  }
});

test("dragging back past Watch only holds at 0 instead of wrapping round to Full send", () => {
  for (const overshoot of [1, 10, 30, 44]) {
    const deg = ((135 - overshoot) * Math.PI) / 180;
    const x = DIAL.cx + DIAL.r * Math.cos(deg);
    const y = DIAL.cy + DIAL.r * Math.sin(deg);
    assert.equal(valueFromPointer(x, y, RECT), 0, `${overshoot} degrees before the start wrapped to ${valueFromPointer(x, y, RECT)}`);
  }
});

test("valueFromPointer never returns anything outside 0-100, anywhere on the plane", () => {
  for (let deg = 0; deg < 360; deg += 1) {
    const a = (deg * Math.PI) / 180;
    const x = DIAL.cx + 200 * Math.cos(a);
    const y = DIAL.cy + 200 * Math.sin(a);
    const v = valueFromPointer(x, y, RECT);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `${deg} degrees gave ${v}`);
  }
});

test("valueFromPointer works against an offset, non-square on-screen rectangle", () => {
  const rect = { left: 120, top: 64, width: 300, height: 300 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (const v of [0, 25, 50, 75, 100]) {
    const deg = ((DIAL.startDeg + v * (DIAL.sweepDeg / 100)) * Math.PI) / 180;
    assert.equal(valueFromPointer(cx + 100 * Math.cos(deg), cy + 100 * Math.sin(deg), rect), v, `value ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Dash arrays
// ---------------------------------------------------------------------------

test("the filled arc never exceeds the track it is drawn on", () => {
  const track = Number(trackDash().split(" ")[0]);
  for (const v of [0, 1, 50, 99, 100, 101, -5, NaN]) {
    const filled = Number(arcDash(v).split(" ")[0]);
    assert.ok(Number.isFinite(filled), `arcDash(${String(v)}) gave ${arcDash(v)}`);
    assert.ok(filled >= 0 && filled <= track + 1e-9, `arcDash(${String(v)}) = ${filled} against a track of ${track}`);
  }
});

test("arcDash(0) is empty and arcDash(100) fills the whole track", () => {
  const track = Number(trackDash().split(" ")[0]);
  assert.equal(Number(arcDash(0).split(" ")[0]), 0);
  assert.ok(Math.abs(Number(arcDash(100).split(" ")[0]) - track) < 1e-9);
});

test("the track is three quarters of the full circumference", () => {
  const [arc, circumference] = trackDash().split(" ").map(Number);
  assert.ok(Math.abs(circumference - 2 * Math.PI * DIAL.r) < 1e-9);
  assert.ok(Math.abs(arc - circumference * 0.75) < 1e-9, `arc ${arc} is not 270 degrees of ${circumference}`);
});
