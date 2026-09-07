// The autonomy dial's geometry and copy, shared by the dashboard and the
// landing page.
//
// Client-safe: no server imports.
//
// This existed twice before — once working in the dashboard, once as a static
// picture on the landing page with a knob positioned by hand at `right: -4px`
// that sat visibly off the track. Two copies of a dial is how you get a knob
// that isn't on its own arc. Everything that decides where a pixel goes now
// lives here and nowhere else.

import { AUTONOMY_BANDS } from "./plans";

// A 270° gauge, open at the bottom, in a 404-unit square. The stroke and the
// knob share `r`, which is the whole fix: a knob drawn on the same radius as
// the arc cannot be anywhere but on it.
export const DIAL = {
  size: 404,
  cx: 202,
  cy: 202,
  r: 152,
  stroke: 16,
  knob: 17,
  // Degrees, measured clockwise from +x as SVG does (y points down). 135° is
  // bottom-left; sweeping 270° ends at 45°, bottom-right.
  startDeg: 135,
  sweepDeg: 270,
};

const CIRCUMFERENCE = 2 * Math.PI * DIAL.r; // ≈ 955
const ARC_LENGTH = CIRCUMFERENCE * (DIAL.sweepDeg / 360); // ≈ 716

export function clampValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** stroke-dasharray for the grey track: the full 270°, then a gap. */
export function trackDash() {
  return `${ARC_LENGTH} ${CIRCUMFERENCE}`;
}

/** stroke-dasharray for the filled arc up to `value`. */
export function arcDash(value) {
  return `${(ARC_LENGTH * clampValue(value)) / 100} ${CIRCUMFERENCE}`;
}

/** Where the knob's centre sits for `value`, in viewBox units. */
export function knobPoint(value) {
  const deg = DIAL.startDeg + clampValue(value) * (DIAL.sweepDeg / 100);
  const a = (deg * Math.PI) / 180;
  return { x: DIAL.cx + DIAL.r * Math.cos(a), y: DIAL.cy + DIAL.r * Math.sin(a) };
}

/**
 * The value under a pointer, given the dial's on-screen rectangle.
 *
 * The 90° dead zone at the bottom snaps to whichever end is nearer rather than
 * wrapping, so dragging past "Full send" cannot flip you to "Watch". That is
 * the difference between a dial and a roulette wheel.
 */
export function valueFromPointer(clientX, clientY, rect) {
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  a = (a - DIAL.startDeg + 720) % 360;
  if (a > DIAL.sweepDeg) a = a < DIAL.sweepDeg + 45 ? DIAL.sweepDeg : 0;
  return Math.round((a / DIAL.sweepDeg) * 100);
}

// What each band means, in the product's own voice. The thresholds are the
// ones in plans.js so the label on the dial can never disagree with the label
// on the pricing page.
const BAND_COPY = {
  "Watch only": { short: "Watch", desc: "I look, I report, I touch nothing at all." },
  Suggest: { short: "Suggest", desc: "A plan on your desk each morning. You press the buttons." },
  "Let it rip": { short: "Let it rip", desc: "I publish, distribute and prospect on my own. I ask before spending." },
  "Full send": { short: "Full send", desc: "I spend too, inside your budget, and hand you the receipts." },
};

export function bandIndex(value) {
  const v = clampValue(value);
  const i = AUTONOMY_BANDS.findIndex((b) => v <= b.max);
  return i === -1 ? AUTONOMY_BANDS.length - 1 : i;
}

export function bandInfo(value) {
  const band = AUTONOMY_BANDS[bandIndex(value)];
  const copy = BAND_COPY[band.label] || { short: band.label, desc: "" };
  return { index: bandIndex(value), label: band.label, short: copy.short, desc: copy.desc, max: band.max };
}

/** Every band with the value that lands in the middle of it — for "jump to" controls. */
/**
 * Where a band's label belongs, as a percentage of the dial box.
 *
 * The four labels used to be four hand-tuned percentage pairs, which is why
 * they collided with the ring and why "Suggest" clipped the left edge: they
 * were guessed against a geometry that is right here in this file. Derived
 * from the same angle maths as the knob, at a radius outside the stroke, they
 * cannot drift when the dial is resized or the sweep changes.
 *
 * `spread` is how far out, as a multiple of the arc radius. 1 is on the arc;
 * anything above about 1.2 clears the stroke and the knob.
 */
export function labelPoint(value, spread = 1.3) {
  const deg = DIAL.startDeg + clampValue(value) * (DIAL.sweepDeg / 100);
  const a = (deg * Math.PI) / 180;
  const radius = DIAL.r * spread;
  return {
    leftPct: ((DIAL.cx + radius * Math.cos(a)) / DIAL.size) * 100,
    topPct: ((DIAL.cy + radius * Math.sin(a)) / DIAL.size) * 100,
  };
}

export function bands() {
  return AUTONOMY_BANDS.map((b, i) => {
    const min = i === 0 ? 0 : AUTONOMY_BANDS[i - 1].max + 1;
    const copy = BAND_COPY[b.label] || { short: b.label, desc: "" };
    return { index: i, label: b.label, short: copy.short, desc: copy.desc, min, max: b.max, mid: Math.round((min + b.max) / 2) };
  });
}
