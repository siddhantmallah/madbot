"use client";

import { useEffect, useRef } from "react";

// Adds an "in" class to every [data-reveal] descendant of the returned ref
// once it scrolls into view, and animates a scroll-progress bar (if present).
export function usePageReveal() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const calm =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const targets = Array.from(root.querySelectorAll("[data-reveal]"));

    if (calm) {
      targets.forEach((el) => el.classList.add("in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const group = entry.target;
              const items = Array.from(group.children);
              const stagger = Number(group.dataset.stagger || 70);
              items.forEach((el, i) => {
                setTimeout(() => el.classList.add("in"), i * stagger);
              });
              io.unobserve(group);
            }
          });
        },
        { threshold: 0.12 }
      );
      targets.forEach((el) => io.observe(el));
    }

    const bar = document.getElementById("m-progress");
    const onScroll = () => {
      if (!bar) return;
      const d = document.scrollingElement || document.documentElement;
      const max = d.scrollHeight - d.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, d.scrollTop / max)) : 0;
      bar.style.transform = `scaleX(${pct})`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return rootRef;
}

// Animates a numeric string like "1,240 → 1,712" or "+38%" counting up when revealed.
export function useCountUp(ref, text, active) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const nums = text.match(/[\d][\d,.]*/g);
    if (!nums) {
      el.textContent = text;
      return;
    }
    const last = nums[nums.length - 1];
    const target = parseFloat(last.replace(/,/g, ""));
    if (!isFinite(target)) {
      el.textContent = text;
      return;
    }
    const from = nums.length > 1 ? parseFloat(nums[0].replace(/,/g, "")) : 0;
    const cut = text.lastIndexOf(last);
    const pre = text.slice(0, cut);
    const post = text.slice(cut + last.length);
    const grouped = last.indexOf(",") > -1;
    const fmt = (v) =>
      grouped ? Math.round(v).toLocaleString("en-US") : String(Math.round(v));
    const t0 = performance.now();
    const dur = 1100;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? pre + fmt(from + (target - from) * e) + post : text;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
