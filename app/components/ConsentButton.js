"use client";

/**
 * Reopens the cookie consent panel (CookieConsent listens for the event). Its
 * own client component so the page around it can stay a server component and
 * ship no JavaScript of its own.
 */
export default function ConsentButton({ children = "Manage cookie preferences", className = "btn btn-secondary" }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("madbot:open-consent"))}>
      {children}
    </button>
  );
}
