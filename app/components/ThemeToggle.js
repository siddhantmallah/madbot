"use client";

import { useSyncExternalStore } from "react";

const KEY = "madbot-theme";
// Fired whenever a toggle changes the theme, so every toggle on the page (the
// dashboard can show more than one) re-reads it.
const EVENT = "madbot:theme";

/**
 * The script that runs before first paint, so a light-mode visitor never sees a
 * dark flash. It has to be inline in <head> — anything loaded as a module runs
 * after the first paint, which is exactly the flash we're avoiding.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function systemTheme() {
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

// "choice:shown" — what the visitor picked ("system" when nothing is stamped)
// and the theme actually on screen. One string, so the store's snapshot
// compares by value and doesn't re-render on every read.
function snapshot() {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "light" || stamped === "dark") return `${stamped}:${stamped}`;
  return `system:${systemTheme()}`;
}

function subscribe(onChange) {
  const media = window.matchMedia(LIGHT_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

// The server has no idea what the visitor's OS prefers, so it renders the
// neutral "Theme" state and the real one arrives after hydration.
const serverSnapshot = () => null;

function apply(choice) {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private window — the choice just won't survive a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * One button, and every press visibly flips the theme. Flipping away from what
 * the OS shows pins that theme; flipping back hands control back to the OS
 * ("system") rather than pinning the OS's current theme, so someone who
 * leaves it matching their OS keeps following it when the OS switches at
 * sunset. That is how a visitor gets back to "system" — before this, the first
 * press pinned a theme and nothing could unpin it.
 */
export default function ThemeToggle({ compact = false }) {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [choice, theme] = snap ? snap.split(":") : [null, null];

  function flip() {
    const shown = snapshot().split(":")[1];
    const next = shown === "light" ? "dark" : "light";
    apply(next === systemTheme() ? "system" : next);
  }

  const isLight = theme === "light";
  const nextTheme = isLight ? "dark" : "light";
  // theme is only set in the browser (the server snapshot is null), so
  // systemTheme() is safe here. The label says when the next press hands
  // control back to the OS.
  const label = theme
    ? `Switch to ${nextTheme} mode${nextTheme === systemTheme() ? " (match system)" : ""}`
    : "Switch colour theme";

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        flex: "none",
        width: compact ? 34 : undefined,
        height: 34,
        padding: compact ? 0 : "0 13px",
        borderRadius: 999,
        border: "1px solid var(--color-divider)",
        color: "var(--fg-70)",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <Glyph light={isLight} />
      {compact ? null : <span>{theme ? `${isLight ? "Light" : "Dark"}${choice === "system" ? " (system)" : ""}` : "Theme"}</span>}
    </button>
  );
}

function Glyph({ light }) {
  return light ? (
    // Sun
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </svg>
  ) : (
    // Moon
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" />
    </svg>
  );
}
