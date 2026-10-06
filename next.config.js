const path = require("path");

const isDev = process.env.NODE_ENV === "development";

// Firebase Auth's popup sign-in talks to its handler through a hidden iframe on
// the project's auth domain, and loads Google's gapi script to do it.
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

// 'unsafe-inline' for scripts is the price of keeping pages static: Next.js
// inlines its own bootstrap scripts, and the alternative is a per-request nonce,
// which forces every page to render on demand instead of from the CDN. What
// this policy still buys is that no script loads from any host not listed here,
// nothing can frame the site, and no form or <base> can be pointed elsewhere.
const csp = [
  "default-src 'self'",
  // React needs eval in development to rebuild server error stacks, never in production.
  `script-src 'self' 'unsafe-inline' https://apis.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  // Inline because React's style={{}} props become style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // blob: is how the dashboard shows favicons it fetched through /api/favicon.
  "img-src 'self' data: blob:",
  // Firestore, Identity Toolkit and the token refresh endpoint.
  "connect-src 'self' https://*.googleapis.com",
  ...(authDomain ? [`frame-src https://${authDomain}`] : []),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // In development the site is plain http on localhost, and upgrading its own
  // requests to https would break every one of them.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Firebase Auth's signInWithPopup (Google/GitHub) needs to read
          // window.closed on the popup it opens — the default strict COOP
          // blocks that check.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Kept alongside frame-ancestors for browsers that predate it.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
      {
        // Not /api/favicon: it re-serves other sites' icons, SVGs included, and
        // sets its own sandboxed policy so a script inside one can never run on
        // this origin. The site's policy, with 'unsafe-inline', must not replace it.
        source: "/((?!api/favicon).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

module.exports = nextConfig;
