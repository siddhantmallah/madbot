import { NextResponse } from "next/server";
import { MFA_COOKIE, SESSION_COOKIE } from "./lib/adminAuth";
import { platformSettings } from "./lib/platform";

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
    // Fonts are self-hosted by next/font (app/layout.js); nothing from Google.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
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

// Pages a search engine has no business indexing: the product, the console,
// and the doors into them.
const PRIVATE_PREFIXES = ["/admin", "/dashboard", "/login", "/invite", "/maintenance"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // The console's outer gate. Without both of its cookies there is nothing to
  // check, so straight to its sign-in. Having them proves nothing yet: the
  // /admin layout verifies the session, the second factor and the role on
  // every render, and every /api/admin route does it again.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    const mfa = request.cookies.get(MFA_COOKIE)?.value;
    if (!session || !mfa) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Maintenance mode, set in /admin: the dashboard shows the maintenance page.
  // The public site and the console stay up.
  let response;
  if (pathname.startsWith("/dashboard") && (await platformSettings()).maintenance?.on) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("Content-Security-Policy", csp);
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
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
