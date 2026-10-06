const path = require("path");

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
        // Pages get their policy, with a per-request nonce, from proxy.js. No
        // API route returns a document, so these may load nothing at all.
        // Not /api/favicon: it re-serves other sites' icons and sets its own
        // sandboxed policy, which must not be replaced.
        source: "/api/((?!favicon).*)",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

module.exports = nextConfig;
