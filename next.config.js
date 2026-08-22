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
        // Firebase Auth's signInWithPopup (Google/GitHub) needs to read
        // window.closed on the popup it opens — the default strict COOP
        // blocks that check.
        source: "/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
    ];
  },
};

module.exports = nextConfig;
