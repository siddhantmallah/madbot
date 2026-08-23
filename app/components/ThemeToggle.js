"use client";

import { useEffect, useState } from "react";

const KEY = "madbot-theme";

/**
 * The script that runs before first paint, so a light-mode visitor never sees a
 * dark flash. It has to be inline in <head> — anything loaded as a module runs
 * after the first paint, which is exactly the flash we're avoiding.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

function currentTheme() {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "light" || stamped === "dark") return stamped;
  // Nothing stamped means "follow the system", which is the default state.
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function ThemeToggle({ compact = false }) {
  // Undefined until mounted: the server has no idea what the visitor's OS
  // prefers, so rendering a specific icon would guarantee a hydration mismatch.
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function flip() {
    const next = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private window — the choice just won't survive a reload.
    }
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme ? `Switch to ${isLight ? "dark" : "light"} mode` : "Switch colour theme"}
      title={theme ? `Switch to ${isLight ? "dark" : "light"} mode` : "Switch colour theme"}
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
      {compact ? null : <span>{theme ? (isLight ? "Light" : "Dark") : "Theme"}</span>}
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
