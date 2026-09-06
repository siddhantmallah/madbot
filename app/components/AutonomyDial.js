"use client";

import { useEffect, useRef, useState } from "react";
import { DIAL, arcDash, trackDash, knobPoint, valueFromPointer, bandInfo, clampValue } from "../../lib/autonomyDial";

/**
 * The one autonomy dial. Drag it, click anywhere on it, or use the keyboard.
 *
 * Renders as an absolutely-positioned layer that fills its parent, so callers
 * give it a square box and put whatever backdrop discs they like behind it —
 * the dashboard and the landing page dress it differently and share everything
 * that moves.
 *
 * The knob is a <circle> inside the same SVG as the arc, on the same radius.
 * Before this it was a <span> positioned in CSS pixels, which is why it drifted
 * off the track the moment the dial was any size other than the one it was
 * drawn at.
 *
 * `animateIn` sweeps the arc up from zero on first paint. On by default for a
 * marketing page where the motion is the point; off on the settings screen,
 * where a dial that swings around before settling on your saved value reads as
 * "something changed".
 */
export default function AutonomyDial({
  value,
  onChange,
  onCommit,
  animateIn = false,
  pulse = false,
  trackColor = "var(--color-neutral-300)",
  fillColor = "var(--color-accent)",
  centre = true,
  // Per-band description overrides, keyed by band label. The default copy is
  // first-person — MADBOT speaking to you inside the product. The landing page
  // describes it in the third person, and mixing "I publish" on the dial with
  // "It publishes" beside it reads as two different products.
  copy,
  children,
  style,
  ariaLabel = "Autonomy",
}) {
  const target = clampValue(value);
  const [dragging, setDragging] = useState(false);
  const [shown, setShown] = useState(animateIn ? 0 : target);
  const rootRef = useRef(null);

  // Sweep up from zero on mount, then track `value` directly. Animating the
  // value rather than the stroke keeps the arc and the knob locked together —
  // transitioning `stroke-dasharray` and `cx`/`cy` separately lets them part
  // company for a frame, and the eye catches it.
  useEffect(() => {
    if (!animateIn) {
      setShown(target);
      return undefined;
    }
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) {
      setShown(target);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Only on mount. Afterwards the effect below owns `shown`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) setShown(target);
    else mounted.current = true;
  }, [target]);

  const base = bandInfo(shown);
  const info = { ...base, desc: copy?.[base.label] ?? base.desc };
  const knob = knobPoint(shown);

  function set(v) {
    onChange?.(clampValue(v));
  }

  function onKeyDown(e) {
    const step = e.shiftKey ? 10 : 1;
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = target + step;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = target - step;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = 100;
    if (e.key === "PageUp") next = target + 10;
    if (e.key === "PageDown") next = target - 10;
    if (next === null) return;
    e.preventDefault();
    set(next);
    onCommit?.();
  }

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={target}
      aria-valuetext={`${target} — ${info.label}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        setDragging(true);
        set(valueFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging) set(valueFromPointer(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
      }}
      onPointerUp={() => {
        setDragging(false);
        onCommit?.();
      }}
      onPointerCancel={() => setDragging(false)}
      className="autonomy-dial"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        touchAction: "none",
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
        outline: "none",
        borderRadius: "50%",
        ...style,
      }}
    >
      <svg viewBox={`0 0 ${DIAL.size} ${DIAL.size}`} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
        <circle
          cx={DIAL.cx}
          cy={DIAL.cy}
          r={DIAL.r}
          fill="none"
          stroke={trackColor}
          strokeWidth={DIAL.stroke}
          strokeLinecap="round"
          strokeDasharray={trackDash()}
          transform={`rotate(${DIAL.startDeg} ${DIAL.cx} ${DIAL.cy})`}
        />
        <circle
          cx={DIAL.cx}
          cy={DIAL.cy}
          r={DIAL.r}
          fill="none"
          stroke={fillColor}
          strokeWidth={DIAL.stroke}
          strokeLinecap="round"
          strokeDasharray={arcDash(shown)}
          transform={`rotate(${DIAL.startDeg} ${DIAL.cx} ${DIAL.cy})`}
        />
        {pulse ? (
          // A soft ring breathing out from the knob, so the eye finds the thing
          // it is allowed to grab. Purely decorative; off under reduced motion
          // via the .dial-pulse rule.
          <circle className="dial-pulse" cx={knob.x} cy={knob.y} r={DIAL.knob} fill="none" stroke={fillColor} strokeWidth={3} opacity={0.5} style={{ transformOrigin: `${knob.x}px ${knob.y}px` }} />
        ) : null}
        <circle cx={knob.x} cy={knob.y} r={DIAL.knob} fill="var(--color-bg)" stroke={fillColor} strokeWidth={5} style={{ filter: `drop-shadow(0 4px 10px rgba(0,0,0,.28))` }} />
      </svg>

      {centre ? (
        <div style={{ position: "relative", textAlign: "center", pointerEvents: "none", padding: "0 17%" }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Autonomy</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 10cqi, 44px)", lineHeight: 1.05, margin: "4px 0 6px" }}>{info.label}</div>
          <div style={{ fontSize: "clamp(11.5px, 3.3cqi, 13px)", lineHeight: 1.45, color: "var(--fg-60)" }}>{info.desc}</div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
