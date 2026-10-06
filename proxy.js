import { NextResponse } from "next/server";

const isDev = process.env.NODE_ENV === "development";

// Firebase Auth's popup sign-in talks to its handler through a hidden iframe on
// the project's auth domain, and loads Google's gapi script to do it.
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

/**
 * The page Content-Security-Policy, built around a nonce made fresh for each
 * request. A script runs only if it carries the nonce or was loaded by one
 * that did ('strict-dynamic'), so markup injected into a page cannot run
 * script even when it lands inline. Next.js reads the nonce back out of the
 * request's copy of this header and stamps it on every script it emits.
 */
function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    // 'strict-dynamic' trusts what a nonced script loads: Next's chunks, and
    // the gapi modules Firebase Auth pulls in. 'self' and the gapi host are
    // ignored wherever 'strict-dynamic' is understood, and are only the
    // fallback for browsers that predate it. React needs eval in development
    // to rebuild server error stacks, never in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline because React's style={{}} props become style attributes, which
    // cannot carry a nonce. A nonce here would also switch 'unsafe-inline' off.
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
}

export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. API routes get a fixed policy from next.config.js, and
      // static files run no script, so a proxy invocation on each would buy
      // nothing. Link prefetches fetch data, not a document.
      source: "/((?!api/|_next/static|_next/image|.*\\.(?:png|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
