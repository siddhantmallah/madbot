# MADBOT hardening audit

Phase 0, 2026-10-14. Read-only: no application code was changed to produce this.

**How this was produced.** Five parallel code reads (fake data, API security, functionality, UI/a11y+SEO, and the Lawzer/Regulane admin reference), plus direct checks: `npm audit`, the full test suite, a production build, live HTTP checks against www.getmadbot.com, and a timing run of the HTML regexes.

**Verification column.**
- **V**: re-checked against the source by hand, or reproduced by running it.
- **R**: reported from a line-by-line code read and not independently re-run.

Nothing in this file is inferred without reading the code.

**Status column.** Each item says Open now. At the end of the work each one will say Fixed, or Deferred with a reason.

---

## 0. System map

| Area | What it is |
|---|---|
| Framework | Next.js 16.3 App Router, React 19, plain JavaScript (no TypeScript, no ESLint config) |
| Middleware | `proxy.js` builds a per-request nonce CSP for pages and does no auth. Headers for `/api/*` come from `next.config.js` |
| Auth | Firebase Auth on the client, with the session in localStorage, not cookies. API routes take the ID token in the body or a header and verify it in `lib/licenseServer.js:15` (`verifiedUid`, Identity Toolkit `accounts:lookup`). No server session and no cookies, so CSRF does not apply today |
| Data | Firestore. `users/{uid}` (profile + server-owned `subscription`), `users/{uid}/sites/{siteId}/{activity,approvals,leads,content,competitors,jobs,pages,social,listings,usage,integrations}`, `users/{uid}/{billing,billingEvents}`, plus server-only `trialLedger`, `mail`, `suppressions` |
| Tenancy | **Single-user. There is no organisation, team, member or seat concept anywhere in the code or rules** |
| Plans and licences | `lib/plans.js` (code-defined plans), `lib/entitlements.js`, `lib/licenseServer.js` (`authorize()`), metering in `lib/costControl.js` + `lib/credits.js`. Manual grants via `/api/billing/grant`, limited to `ADMIN_UIDS` |
| Admin | No admin UI. The only admin concept is the `ADMIN_UIDS` env allowlist (`lib/billingAdmin.js:178`), used by one route |
| AI | Anthropic SDK (`lib/aiModels.js`), server-side only |
| Email | Resend (`lib/email.js`), delivery webhook with Svix HMAC |
| Deploy | Vercel. Crons: `/api/cron/tick` every 6h, `/api/cron/retention` daily |
| Tests | `npm test` runs 19 custom suites: 651 pass, 68 fail, 1 skip. 64 of the failures are `api`/`ssrf` suites that need `next dev` on :3000. The other 4 are real (see F-17 to F-19) |
| Build | `next build` passes. Every route is dynamic because of the nonce CSP (deliberate) |
| Lint / types | `npm run lint` is broken: `next lint` was removed in Next 16. There is no type checker because the project is JavaScript |

---

## 1. Fake / unbacked data

No `Math.random()` drives any displayed value, and there is no lorem ipsum, fake testimonial, fake logo, fake rating or review, or faked API success. What remains is marketing copy that promises features the code does not have, plus fabricated rows that may still sit in production.

| ID | Sev | File:line | Finding | Ver | Status |
|---|---|---|---|---|---|
| D-1 | High | `scripts/prune-seeded-approvals.cjs` and git `7400e6b..43241ce` | A signup seed that ran 22–23 Aug 2026 wrote fabricated leads ("Northwind Logistics", "Bramble Health", "Kestrel Payments", …), content and activity rows into real accounts. The prune script only removes the 3 seeded approval titles. Leads, content and activity are unfiltered in `lib/sites.js` and feed the digest. **Whether the rows still exist in production is unverified**: a dry run of the prune script was blocked by this session's permission guard | V (history) | **Fixed in code; you need to run it.** `scripts/prune-seeded-data.cjs` (dry run by default) covers all four kinds: leads, content, activity and approvals. Each matcher needs the seed's text plus a structural mark no real record has. `tests/seedPrune.test.mjs` pulls the seed code from git at 7400e6b and 1de44ba, runs it, and proves every fabricated record is caught and no real record is touched. The old approvals-only script is deleted: it required status "yes", but every seed version wrote "pending", so it would have skipped the ones still in people's queues. |
| D-2 | High | `app/page.js:401` | "the 83 openings you didn't know were there": a hardcoded number, not measured | V | **Fixed.** "the 83 openings" became "the openings". |
| D-3 | High | `app/page.js:404`, `app/about/page.js:86`, `lib/plans.js:216,298` | "Friday / weekly digest" is claimed, but there is no digest cron in `vercel.json`. `/api/send-digest` only runs from a button. The app's own `Autonomy.js:173-185` says there is no scheduled email | V | **Fixed (copy).** The homepage, About, Terms, Sub-processors and the Agency plan now say the digest is sent when you ask. The digest feature label is now "Digest email". |
| D-4 | High | `app/page.js:46-47,78-79`, `lib/autonomyDial.js:78-79`, `OnboardingModal.js:189-190`, `lib/plans.js:138,180`, `about/page.js:123` | The autonomy dial copy promises unattended publishing and spending "inside your budget". The dial only gates the weekly AI-visibility re-check (≥48, `lib/scheduler.js:41-46`). There is no budget setting. "Autonomy up to 100" unlocks nothing above 48 | R | **Fixed (copy).** The dial's band copy on the homepage, the dashboard dial (`lib/autonomyDial.js`), the onboarding step (which now reads the dial's own copy) and About now describe what `lib/scheduler.js` actually does. The FAQ says nothing publishes at any setting. Growth's blurb was rewritten and Pro no longer sells "Autonomy dial up to 100". |
| D-5 | Medium | `lib/plans.js:122,159,193`, pricing cards | The plans sell "1,000/5,000/15,000 outreach emails" (plus a top-up), but MADBOT never sends outreach (it uses mailto) and nothing meters `emails`. The Billing row is always 0 | R | **Fixed.** The "outreach emails" line is gone from `highlightsFor()`, the Billing meter, Terms and Refunds. `plan.emails` stays in the data for when sending exists. |
| D-6 | Medium | `pricing/page.js:142-158`, `lib/credits.js:77-82`, `Billing.js:145` | Top-ups are priced and offered, but no code path can buy or grant one | R | **Fixed.** The top-up price list is gone from the pricing page, with a TODO to restore it once there's a checkout. Billing, Terms and Refunds now say top-ups aren't on sale yet. The `TOPUPS` prices are kept in `lib/credits.js`. |
| D-7 | Medium | `app/page.js:632`, `pricing/page.js:96`, `OnboardingModal.js:189` | "Most popular" / "most people" badges, with no customers to back them | R | **Fixed.** The "Most popular" badges (homepage and pricing) and the onboarding badge "most people" are removed, with a TODO to restore a badge when signup data supports one. The highlighted card stays as a recommendation. |
| D-8 | Medium | `app/page.js:38,51,295,403`, `login/page.js:18`, `AuditModal.js:775`, `layout.js:18` | The copy says MADBOT "lists you in directories" and "fixes, submits, pitches". `lib/listings.js:11` is explicitly not an auto-submitter, and there is no fixing, submitting or pitching code | R | **Fixed.** The marquee, hero, FAQ, JSON-LD, layout meta description, login and the audit report now say "writes your directory listings, ready to paste in". |
| D-9 | Medium | `OnboardingModal.js:158-160,206,221` | Promises "places that link to rivals" (no backlink feature), "never email the same person twice in 30 days" (no such guard), and "read every page" (the crawl is capped at 20 pages, depth 2) | R | **Fixed.** The onboarding list now names things the product measures. "Never email the same person twice" became "I never email a prospect myself", and "every page" became "up to 20 pages". |
| D-10 | Medium | `AuditModal.js:328` | The free report labels every fix "MADBOT would →", including ones it can't do (HSTS, server headers, compression, analytics) | R | **Fixed.** Every finding's fix is now labelled "How to fix →", because every fix text is an instruction to the site's owner. The next-steps panel and the panel below it describe only what MADBOT does. Checked live: 16 of 16 labels, 0 "MADBOT would". |
| D-11 | Medium | `app/page.js:404` | "One honest baseline it never re-bases": there is no baseline or score-history feature | R | **Fixed.** The "honest baseline it never re-bases" claim is removed. |
| D-12 | Low | `legal/privacy`, `cookies`, `subprocessors` | `updated="6 September 2026"`, but these were materially changed on 7 and 15 Sep (`a81c7e0`, `c52b84f`) | R | **Fixed.** Each "updated" date now matches the last real change to that document, checked against `git log`. Privacy, Terms, Refunds and Sub-processors were changed again in Phase 2 and now read 14 October 2026; Cookies reads 15 September 2026. |
| D-13 | Low | `AuditModal.js:287-301` | The scanning checklist ticks on a 900ms timer, not on real progress | R | **Fixed.** The checklist is now a static "What's being checked" list with no timed ticks. |
| D-14 | Low | `lib/digest.js:76,97`, `DigestPanel.js:10` | "This week on {domain}" shows all-time counts | R | **Fixed.** The heading is now "Where {domain} stands" in the panel, the email and the plain text, which matches its all-time counts. |
| D-15 | Low | `lib/plans.js:78,108` | Free "Daily monitoring" runs out of credits before the month ends. Starter's "AI visibility tracking" can never auto-run (its autonomy cap is 47) | R | **Fixed.** Free's "Daily monitoring" became "Scheduled audits and crawls", and the dead "10 lead credits" line is gone. Starter's "AI visibility tracking" became "AI visibility checks, on demand". |
| D-16 | Low | `app/page.js:393,588,694` | "Gets better every week" (there is no learning loop). "Ninety seconds" contradicts "~10s" elsewhere. One customer anecdote can't be verified from the code | R | **Partly fixed.** "Gets better every week" is gone, "Ninety seconds" became "A minute", and the "over and over, without you" heading was corrected. The Mumbai sofa example stays with a `TODO(Siddhant)`: nothing in the repo records that run, so only you can confirm it. |
| D-17 | Medium | `app/legal/security/page.js` | Found in Phase 4. After Phase 3 the Security page still described the old model: "every document is scoped to the account that owns it", and a subscription field on the user's profile. Neither has been true since organisations arrived, and the page said nothing about staff access | V | **Fixed (Phase 4).** It now describes membership and role checks, server-only licences and memberships, and read-only suspended organisations. A new "Our own access" section covers the console's TOTP, 8-hour sessions, role limits and append-only audit log. I checked that no console route reads customers' work before writing "not the content of your work". Date moved to 15 October 2026 in `lib/legalDates.js`. |

**Checked and real (no action needed):** prices (`lib/plans.js` is the single source), the "25+ checks" claim (about 68 exist), the GitHub/X/LinkedIn/Meta/Search Console/Resend/Claude integrations, lead signals (RDAP, CT logs, Companies House), competitor change detection, JSON-LD (no fake ratings), and honest empty states across the dashboard. `lib/seed.js` today is clean.

---

## 2. Security

| ID | Sev | File:line | Finding and exploit | Ver | Status |
|---|---|---|---|---|---|
| S-1 | **Critical** | `app/api/jobs/run/route.js:49-52` | Metering only runs `if (meter && siteId)`, so leaving out `job.siteId` skips `reserve()` entirely and `executeJob` still runs. Any trial user can loop `ai_visibility` (Claude + web search per question), `lead_discover` and `lead_qualify` with no cost. A free user can do the same with `crawl_site`, with a client-chosen `maxPages`. The result is unbounded Anthropic spend and an outbound-fetch amplifier | V | **Fixed.** `siteId` is required for every job and `reserve()` always runs. The server reads the URL, competitors, intelligence and buyer profile from Firestore instead of trusting the request. Questions are capped at 8, companies at 15 and pages at 20. Tested in `tests/apiGuard.test.mjs`. |
| S-2 | **Critical** | `next` 16.3.2 (`npm audit`) | Critical advisories include unauthenticated RCE (Windows hosts), RCE in Image Optimization (AVIF) and in `next/og`, cache poisoning, and SSRF in Image Optimization. A patched release is available (`fixAvailable: true`) | V | **Fixed.** Upgraded to `next` 16.3.8, the patch release that covers every listed advisory. `npm audit --omit=dev` reports 0. |
| S-3 | High | `lib/costControl.js:37`, plus `generate-content:37`, `leads/outreach:46`, `listings/prepare:43`, `social/draft:47` | Usage and the daily cap are keyed per site, and these routes accept any `siteId` without checking that it exists. A fresh random `siteId` per call means usage reads as zero, which bypasses monthly credits, content and social allowances and the daily USD cap. `maxSites` is enforced only in the browser (`firestore.rules:52` lets clients create unlimited sites) | V | **Fixed.** `reserve()` now refuses a site that isn't on the account or is beyond `maxSites` (`lib/siteLimits.js`). It also checks a new account-wide ledger, `users/{uid}/usage`, capped at allowance × maxSites, in the same transaction as the hold, which also closes a race between parallel requests. Allowances still count per site, as the Billing screen says; see open question 1. Tested in `tests/licenseEnforcement.test.mjs`. |
| S-4 | High | `app/api/send-digest/route.js:37-52` | Takes `subject` and `html` from the body and sends them from MADBOT's verified domain to the token's email, with no `emailVerified` check, no rate limit and no plan gate. An attacker signs up with a victim's address and loops branded phishing to it | V | **Fixed.** The server now builds the digest from Firestore. It accepts only numeric Search Console figures, requires a verified email, and allows 3 sends per 10 minutes and 10 per day. |
| S-5 | **Critical** | `app/api/read-site/route.js:92-101`, `lib/htmlParse.js` (several), `lib/audit.js:613,624` | Catastrophic regex backtracking on attacker-controlled HTML, reachable without signing in. Measured when the fix was written: on **60 KB** of `<meta content="` the old `metaContent` took **87 s** and `extractIcon` took 71 s (that is `read-site`'s own pattern). `/api/audit` reads up to 1.2 MB. `read-site` had no throttle. Raised from High in Phase 1 | V | **Fixed.** `lib/htmlTags.js` is a linear tag scanner. Every hostile-HTML extractor in `htmlParse`, `audit`, `leadEngine` and `read-site` now uses it. `tests/redos.test.mjs` holds 30 extractors to 1.5s on 36 hostile shapes of 1.2MB each; the worst measured case is 169ms, against 87s on 60KB before. |
| S-6 | High | `app/api/leads/profile/route.js:46`, `app/api/visibility/questions/route.js:42` | AI calls with no `reserve()`, no rate limit and no input-size cap (`intel.*` goes straight into prompts) | V | **Fixed.** Both routes read the site's intelligence from Firestore and are now metered, as decided on 2026-10-14. They charge 2 credits each (`BUYER_PROFILE` and `VISIBILITY_QUESTIONS`), reserved before the call, recorded at real token cost after it, and refunded on failure. Rate limited too. |
| S-7 | High | `npm audit`: `firebase`→`@grpc/grpc-js`, `sharp`, `brace-expansion`, `source-map-js` | 7 high advisories. npm's suggested `firebase@9.14.0` would be a downgrade; the real fix needs checking against current firebase releases | V | **Fixed.** Added an `@grpc/grpc-js ^1.14.5` override. Upgrading firebase wouldn't help, because firebase 13 still pins `~1.9`. Also updated sharp to 0.35.5, brace-expansion to 2.1.7 and source-map-js to 1.2.2. |
| S-8 | High | (missing) | No rate limiting anywhere except an in-memory per-instance throttle on `/api/audit` and a raceable cooldown on `send-verification`. This covers the AI routes, email routes, `read-site`, `snapshot` and `favicon` | V | **Fixed for our API.** `lib/apiGuard.js` `rateLimit()` keeps Firestore-backed counters and is applied to every AI, email, public-fetch, signed-in fetch, publish and account route. Login, signup, password reset and OTP go from the browser straight to Firebase Auth and never touch our API. Firebase applies its own abuse limits there, and tightening them means App Check or reCAPTCHA in the Firebase console (**Deferred**: console configuration). Admin TOTP gets its own limit in Phase 3. |
| S-9 | Medium | `app/api/auth/send-verification/route.js:57-115`, `lib/email.js:129-130,154,201-202` | The cooldown is read and written outside a transaction, so parallel requests each send a mail. `displayName` (set by the client) and `siteUrl` go into the email HTML unescaped (HTML injection). The `Origin` header picks the continue URL | V | **Fixed.** The cooldown is now claimed inside a transaction, and the route is rate limited. Display names, site URLs and links are escaped in the email HTML. The continue URL comes from `SITE_URL`, not the `Origin` header. |
| S-10 | Medium | `firestore.rules:52-91` | Sites and every subcollection are fully client-writable with no field or count limits. This enables S-3 and S-11. `schedule.*.lastRunAt` can be set to 1970 to monopolise scheduler slots. The client can flip `social.status` to "approved" and skip its own approval queue (`social/publish:54`), which is owner-only, not cross-tenant | R | **Partly fixed (Phase 3); remainder deferred.** The Phase 3 rules gate every write under an organisation by role permission (`sites.manage`, `work.run`), and deciding an approval or a social post now needs `approvals.decide`, so a role without it can't self-approve. **Deferred:** per-field and count constraints on site documents. The server no longer trusts anything they would protect: the site count is enforced in `reserve()`, and the scheduler caps `lastRunAt` and takes one job per account per tick. A field allowlist across the dashboard's ~20 write paths is a Phase 5 change and needs the dashboard exercised live. |
| S-11 | Medium | `app/api/cron/tick/route.js:70`, `cron/retention/route.js:59` | `collectionGroup(...).limit(200/2000)` with no cursor. One account with many sites or leads starves everyone else's scheduling and **retention deletion**, which also makes this a GDPR/DPDP problem | R | **Fixed.** Both crons now page through every document by document id, reading only the fields they need. The scheduler takes one job per account per tick and caps how overdue a site can claim to be at 30 days. Checked against production with `/api/cron/tick?dryRun=1`: 26 sites, no index needed. |
| S-12 | Medium | `app/api/audit/route.js:10-23`, `read-site` | Public fetch amplifier: about 5-6 outbound fetches per request to a host the caller picks. The throttle is per instance and in memory; `read-site` has none | R | **Fixed.** `/api/audit` and `/api/read-site` now use the Firestore limiter per IP (12 per minute, 150 per day), replacing the per-instance in-memory throttle. |
| S-13 | — | `lib/crawler.js` `fetchSitemapUrls()` | `Sitemap:` URLs from the target's robots.txt (and sitemap-index `<loc>`s) aren't re-validated against private hosts or the origin. Proven by the existing failing test in `tests/crawler.test.mjs` | V | **Retracted, not reproducible.** `safeFetch` validates the first URL as well as every redirect (`lib/urlGuard.js:179`), and the SSRF suite confirms private targets are refused. The failing test was checking the source text for the string `assertPublicHost`; it now tests the behaviour and passes. |
| S-14 | Medium | `app/api/privacy/export/route.js:67` | The ID token travels in the query string, so it lands in Vercel logs and browser history | R | **Fixed.** Export is now a POST with the token in the body. The dashboard saves the response as a file, and a failure shows inline instead of a raw JSON page. |
| S-15 | Medium | `app/api/privacy/delete/route.js:51` | Irreversible account deletion accepts any valid ID token, with no recent-login (`auth_time`) check | R | **Fixed.** Deletion requires a sign-in within the last 10 minutes (`auth_time`). The dashboard explains this and offers a "Sign in again" button. |
| S-16 | Medium | `lib/licenseServer.js:15-32` | Token verification uses Identity Toolkit `accounts:lookup` rather than the Admin SDK `verifyIdToken(token, true)`. Revocation, `auth_time` and `email_verified` are never checked centrally | R | **Fixed.** `verifyIdentity()` uses the Admin SDK's `verifyIdToken(token, true)`, which rejects revoked tokens and disabled accounts and exposes `email_verified` and `auth_time`. `licenseServer` uses it, so every route does. |
| S-17 | Medium | `lib/trialLedger.js`, `start-trial/route.js:136-172` | Anyone with their own domain gets unlimited 14-day trials (`a1@`, `a2@`…). Separately, a null ledger key fails open: the trial is granted and nothing is recorded, contrary to the comment at `trialLedger.js:41` | V | **Fixed.** A null ledger key refuses the trial. One trial per custom domain per 30 days, as decided on 2026-10-14: `trialDomains`, a hashed domain key, with public mail providers exempt. The Privacy Policy, the deletion response and the export text all say so. Tested in `tests/trialLedger.test.mjs`. |
| S-18 | Medium | (missing) | No input schema validation at the API boundary. Every route hand-checks one or two fields. Unbounded strings reach AI prompts and Firestore paths (`siteId` can contain `/`, though it stays under the caller's own uid) | R | **Fixed.** Every route that takes a body has a zod schema at the boundary, with capped lengths and unknown keys dropped. `siteId`, `contentId` and `postId` are restricted to Firestore id characters. |
| S-19 | Low | `admin-status:22`, `ai-status:36`, `cron/retention:15`, `cron/tick:34` | `CRON_SECRET` is compared with `===`, not constant-time | V | **Fixed.** `secretMatches()` compares the SHA-256 of both values in constant time, and an unset secret matches nothing. |
| S-20 | Low | 14 routes (e.g. `send-verification:97`, `start-trial:221`, `privacy/delete:119`) | Raw provider or internal error messages are returned to clients (no stack traces) | R | **Fixed.** `failure()` logs the error and returns a plain message. Coded errors that we wrote, such as "crawl more pages", are still shown. Shown on purpose: GitHub, social and Search Console connection errors, which describe the customer's own token, and `billing/grant`, which is admin-only. |
| S-21 | Low | `app/api/billing/grant/route.js:42,73` | `PLANS[plan]` accepts prototype keys (`"constructor"`), and the stored plan would then throw inside every cron tick. `months` and `amountMinor` are unbounded. Only reachable by `ADMIN_UIDS` | R | **Fixed.** The schema now restricts `plan` to the keys of PLANS. `months` must be 1–36, the amount is bounded, and `currency` and `type` are enums. |
| S-22 | Low | `.gitignore` | Only `.env*.local` is ignored, so a `.env` or `.env.production` would be committed | V | **Fixed.** `.env` and `.env.*` are now ignored, with `.env.local.example` kept. Checked with `git check-ignore`. |
| S-23 | Low | repo root | The service-account key `madbot-256aa-firebase-adminsdk-*.json` sits in the working tree. It is gitignored and was never committed (history checked), but it should live outside the repo directory | V | **Deferred.** Moving the credential file is your call. Nothing in the repo reads it (all three scripts use `FIREBASE_SERVICE_ACCOUNT_B64`), and DEPLOY.md now says to keep it outside the repository. |
| S-25 | Low | `eslint-config-next` → `fast-glob` → `micromatch` → `braces` | Found in Phase 1. `braces` <=3.0.3 can be made to exhaust the stack by deeply nested patterns. It is dev-only lint tooling that only ever sees our own globs, and no patched release exists (3.0.3 is the latest). `npm audit --omit=dev` is clean | V | **Accepted (dev-only).** Revisit when `braces` ships a fix |
| S-24 | Info | `proxy.js`, `next.config.js`, live headers | **Already good:** nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, XFO DENY, nosniff, Referrer-Policy and Permissions-Policy; HSTS `max-age=63072000` is present on the live site (set by Vercel, not by the app); API routes get `default-src 'none'`; firestore rules default-deny with an allowlist on user docs; no secrets in client bundles; no `.env` or key ever committed; `dangerouslySetInnerHTML` is used only for static JSON-LD and the nonced theme script; the SSRF guard checks every redirect hop. No cookies are used, so cookie flags and CSRF are not applicable **until an admin session cookie is added** | V | — |

---

## 3. Functionality bugs

| ID | Sev | File:line | Finding | Ver | Status |
|---|---|---|---|---|---|
| F-1 | High | `app/login/page.js:177-182, 236-238` | Signup skips the "confirm your email" screen. The redirect effect fires when `user` is set, before `setMode("verify")` | V | Open |
| F-2 | High | `AuthProvider.js:130-142`, `AccountNotices.js:22-31` | A user who verifies on another device never gets their trial: `ensureTrial` only runs on sign-in or while polling, and `?verified=1` is never read | R | Open |
| F-3 | High | `lib/sites.js:113-128`, `dashboard/page.js:1305` | If the sites listener errors, the dashboard spins forever, because the error callback never calls `cb` | R | Open |
| F-4 | High | `dashboard/page.js:484-502`, `Opportunities.js:199-204` | "Go get it" and "Not for us" only write flags that nothing reads. "Queued — I am on it" is untrue | V | Open |
| F-5 | High | `DataRules.js`, `lib/jobRunner.js:292`, `cron/retention:81` | The Data & privacy rules are saved but never enforced: `policyCheck` always uses `DEFAULT_POLICY` (a compliance issue) | V | Open |
| F-6 | High | `dashboard/page.js:153,758` | Search Console state isn't reset on site switch, so site B shows A's traffic, A's data feeds B's opportunities and digest, and Refresh writes A's property onto B | R | Open |
| F-7 | High | `Listings.js:51-53,150` | After "Rewrite" the new copy never shows, and Save writes the old copy back | R | Open |
| F-8 | Medium | `OnboardingModal.js:252-254` | Can't be closed on steps 1–3 (no cancel, no Escape) | R | Open |
| F-9 | Medium | `Content.js:305-308`, `page.js:555` | The GitHub connect dialog closes even on failure, which hides the error | R | Open |
| F-10 | Medium | `lib/jobClient.js:381-390` | Retryable or abandoned jobs stay "queued"/"running" forever and inflate "N runs in flight". Nothing retries them | R | Open |
| F-11 | Medium | `AccountNotices.js:29` | Unverified users tear down and re-subscribe about 13 Firestore listeners every 10s (the activity query has no limit) | R | Open |
| F-12 | Medium | `Leads.js:42,240`, `page.js:509` | Declined leads are still qualified (spending a credit) and keep their long retention | R | Open |
| F-13 | Medium | `dashboard/page.js` (446–516, 949, 955, 1259, 1262, 1530) | About 20 fire-and-forget writes with no catch, no error and no rollback. "Saved." is shown before the write lands | R | Open |
| F-14 | Medium | `page.js:397-428,712-739,580-589,1193-1203,750-759,823` | Async handlers without catch or `res.ok`: audit rerun, ask-for-piece, disconnect GitHub/social (marked disconnected even if it failed), GSC stuck "loading", competitor check silent | R | Open |
| F-15 | Medium | `SearchConsolePanel.js:73-77`, `Social.js:432,508`, `Listings.js:212` | Dead ends: GSC "reconnect" with no button; social Connect with no pending state (double submit); copy says you can draft or write when no control exists | R | Open |
| F-16 | Medium | `AuditModal.js:540-603` | After 60s the free report removes close, Escape and backdrop close, and body scroll stays locked, which traps the visitor | R | Open |
| F-17 | Medium | `page.js:899-918,1049`, `OnboardingModal.js:63-81` | Stale visibility questions after a site switch; a failed run clears approved questions; a retry after a partial onboarding failure creates a duplicate site | R | Open |
| F-18 | Medium | `lib/crawler.js` | A start URL disallowed by robots.txt is dropped silently and reported as `blockedByRobots:false` (failing test) | V | Open |
| F-19 | Low | `lib/officialSources.js`, `lib/consent.js` | `notConfigured` misreports key-less sources; `MODELS.notice` is dead (both failing tests) | V | Open |
| F-20 | Low | various | No confirmation on "Bin it" (social, permanent) or competitor Remove; "Approve & open in mail app" marks the item sent even if it never was; Pause doesn't stop user-started runs; the reset email doesn't return to the app; `/api/ai-status` is fetched twice; the consent panel can't be dismissed when reopened | R | Open |
| F-21 | Low | `package.json` | `npm run lint` is broken (`next lint` was removed in Next 16) | V | **Fixed.** Set up ESLint 9 with `eslint-config-next@16.3.8` using the flat config from the Next 16 docs (`eslint.config.mjs`). `npm run lint` now runs; see F-23. |
| F-22 | Low | `app/dashboard/page.js:1233`, `app/api/listings/prepare` | Found in Phase 1. Listing copy is sent `site.intelligence.pages`, a field the intelligence object doesn't have (it has `structure.topPages`), so the pipeline never sees the site's pages | V | Open (Phase 5) |
| F-23 | Low | `app/components/*`, `app/dashboard/page.js`, `app/dashboard/screens/Social.js`, `lib/useRegion.js` | Found in Phase 1, once lint ran again. 23 lint errors in existing UI code: 21 `react-hooks/set-state-in-effect`, 1 `react-hooks/immutability` (`AuditModal.js:577`) and 1 unescaped entity (`Social.js:457`). None of them is in code changed in Phase 1 | V | Open (Phase 5) |
| F-24 | Low | `app/api/read-site/route.js` | Found in Phase 4 when `api.test` failed on пример.рф. Every failure on the target's side came back as "Couldn't read that site in time", including a broken certificate chain (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), which no amount of waiting fixes | V | **Fixed (Phase 4).** `describeFetchFailure()` in `lib/urlGuard.js` says which it was: certificate, timeout, or no connection. It is unit-tested in `urlguard.test`. `api.test` counts those as upstream facts, as its own comment already said they were. |

**Verified working:** every internal link and route target exists; sign-in, password reset and email verification work end to end; listeners unsubscribe; the job lease is transactional; account deletion requires a typed phrase that the server re-checks.

---

## 4. UI and accessibility

| ID | Sev | File:line | Finding | Ver | Status |
|---|---|---|---|---|---|
| U-1 | High | `app/globals.css:74-144` | The light theme never redefines `--color-accent` (#FF6A1A on #F6F4F8 = **2.62:1**). This affects `.card-kicker`, `.hard-index`, `.btn-ghost`, `.tag-outline`, **every link in every legal page** (`.legal-prose a`), and inline accent text across the site and dashboard | R | Open |
| U-2 | High | `dashboard/page.js:1763-1768` | Toast: the close "×" has no label, there is no `aria-live`, and its fixed 352px width overflows a 375px viewport | R | Open |
| U-3 | High | `OnboardingModal.js:85,115` | Full-screen modal with no `role="dialog"`, `aria-modal`, Escape or focus trap; the URL input has no label | R | Open |
| U-4 | Medium | `Content.js:30,133`, `Social.js:19`, `AuditModal.js:544-610` | Dialogs lack `aria-labelledby`, focus trap, Escape and focus restore | R | Open |
| U-5 | Medium | `CompetitorPanel.js:94`, `Approvals.js:141-142`, `Autonomy.js:134`, `DataRules.js:127`, `Social.js:183`, `Listings.js:21-43` | Inputs, selects and textareas without programmatic labels | R | Open |
| U-6 | Medium | `globals.css` | Light-mode contrast: muted text 4.48:1, `.mono` and meta text 3.07:1, placeholders 2.22:1. Dark-mode meta text 4.49:1. `.dark-stage` in light mode: accent-2-700 2.23:1, links 2.99:1. Hardcoded `#FF8A6B` for negative deltas: 2.31:1 | R | Open |
| U-7 | Medium | `page.js:352,378-383,89-117`, `login/page.js:330`, `dashboard/page.js:1475,1766`, `OnboardingModal.js:239,242` | Inline infinite animations ignore `prefers-reduced-motion`. The marquee and ticker have no pause control (WCAG 2.2.2). Marquee items are read twice by screen readers | R | Open |
| U-8 | Medium | `app/page.js:209,216` | `overflowX:hidden` on the wrapper likely breaks the sticky header (`overflow-x: clip` is the fix). **Needs browser confirmation** | R | Open |
| U-9 | Medium | `app/page.js:287` | The hero `<h1>` starts at `opacity:0` (`.reveal`) until hydration, which delays LCP and leaves content invisible without JS | R | Open |
| U-10 | Low | various | No skip link; no `aria-current` on dashboard nav; the Visibility toggle has no `aria-pressed`; few live regions; `scroll-behavior:smooth` isn't gated on reduced motion; no `color-scheme`; the theme toggle can't return to "system"; login has an h2 before the h1; footer h4 sits under h2; tables lack captions and `scope` | R | Open |

**Already good:** visible `:focus-visible` ring; the dial is an accessible slider; hero and login fields are labelled; decorative images use `alt=""`; dark mode has no flash; the WebGL scene is lazy and honours reduced motion; dashboard tables scroll; breakpoints are centralised. **Not yet checked live at 375/768/1440**: that happens in Phase 5 with the browser pane, and the dashboard needs you signed in.

---

## 5. SEO

| ID | Sev | File:line | Finding | Ver | Status |
|---|---|---|---|---|---|
| E-1 | Medium | (missing `app/dashboard/layout.js`) | `/dashboard` serves the homepage title, a self-canonical and no `noindex`. robots.txt blocks crawling, but the URL can still be indexed (checked live) | V | **Fixed (Phase 4).** `app/dashboard/layout.js` gives it its own title, `noindex, nofollow` and no canonical. robots.txt no longer disallows it: a crawler has to be allowed to fetch a page to see its noindex, and blocking it was why the URL could be indexed from a link alone. |
| E-2 | Medium | (missing `app/not-found.js`) | The 404 is Next's default page: no nav, no links, a duplicate `<title>` and a self-canonical on a 404 (checked live) | V | **Fixed (Phase 4).** `app/not-found.js`: the site header, a line of explanation, links to the five places the site goes, and the footer. It answers 404, with noindex, one title and no canonical. |
| E-3 | Medium | `app/layout.js:53` | The homepage `og:url` is the apex `https://getmadbot.com` while the canonical is www (checked live) | V | **Fixed (Phase 4).** The root `openGraph.url` is now `/`, which resolves against `metadataBase` to the www host, the same as the canonical. |
| E-4 | Medium | `app/globals.css:1` | Google Fonts are loaded via CSS `@import` (render-blocking chain, no size-adjusted fallback for the LCP font, visitor IPs go to Google). `next/font` fixes all three | R | **Fixed (Phase 4).** Caprasimo and Figtree come from `next/font/google` in `app/layout.js`: self-hosted at build time, preloaded, with size-adjusted fallbacks. The `@import` is gone, and so are `fonts.googleapis.com` and `fonts.gstatic.com` from the CSP. A side effect: visitors' IP addresses no longer go to Google on every page view, which no policy had disclosed. |
| E-5 | Medium | `app/layout.js:124-128` | The nonce CSP makes every page dynamic, including the legal pages, so TTFB is higher. A deliberate trade-off, listed so it's a conscious choice | V | **Deferred, kept as a conscious trade-off.** Measured live on 2026-10-15: every page is a Vercel cache MISS, with a time to first byte of 0.33 to 1.4 s from India. The alternative that keeps a strict CSP on static pages is Next's hash-based Subresource Integrity, which is still marked experimental in Next 16 and would mean re-proving the whole policy against Next's inline scripts. Revisit when SRI is stable; until then the nonce stays, because the CSP is worth more than the TTFB. |
| E-6 | Low | `public/opportunity-graph.png` | 2.6 MB, 1600×1600 PNG as a raw `<img>` (WebGL fallback) | R | **Fixed (Phase 4).** `public/opportunity-graph.webp`, 422 KB down from 2.6 MB at the same 1600 px. It is the WebGL fallback only, at 45–50% opacity, so the quality loss can't be seen. The PNG is left in `public/`, unreferenced. |
| E-7 | Low | `app/page.js:6`; contact + 8 legal pages | `AuditModal` (795 lines) loads eagerly; 9 pages are `'use client'` with no hooks, which ships needless JS | R | **Fixed (Phase 4).** `AuditModal` loads through `next/dynamic` when the report first opens. The 9 legal pages, the contact page and the `LegalPage` shell are server components now; the one interactive bit (reopening cookie preferences on `/legal`) is `app/components/ConsentButton.js`. The site-wide Firebase client bundle still loads on these pages through `AuthProvider` in the root layout; trimming that is a larger change, left for Phase 5. |
| E-8 | Low | `app/sitemap.js:33` | `lastModified: new Date()` on every URL on every request | R | **Fixed (Phase 4).** `lib/legalDates.js` holds each legal document's last-changed date. The page shows it and the sitemap sends it as `<lastmod>`, so the two can't disagree. Marketing pages carry no lastmod rather than an invented one. |
| E-9 | Low | (missing) | No web manifest (`/manifest.webmanifest` 404 live), no `themeColor`, no `twitter:site`; 8 descriptions run 150–168 chars; no BreadcrumbList on legal pages (the `breadcrumbs()` helper exists but is unused); robots `host` is non-standard | V | **Fixed (Phase 4), one part deferred.** Fixed: `app/manifest.js` with new opaque icons (`app-icon-192/512.png`, white mark on the brand ground, maskable-safe); `themeColor` for dark and light; every description cut to 155 characters or fewer; a BreadcrumbList on every legal page; no `host` line in robots.txt. **Deferred:** `twitter:site`, because MADBOT has no X account to name. Inventing a handle would be a fabricated record. |
| E-10 | — | robots | robots.txt disallows `/dashboard` and `/api/`. **`/admin` will need adding** in Phase 3/4 | V | **Fixed (Phase 3).** `app/robots.js` also disallows `/admin`, `/invite` and `/maintenance`. Those pages carry `noindex` too, in metadata and in the proxy's `X-Robots-Tag`, and `tests/adminGuard.test.mjs` checks both. |

**Already good (checked live):** a unique title, description and canonical per public page; OG and Twitter tags with a 1200×630 `og.png`; `metadataBase` set; `/login` noindex; Organization + WebSite + SoftwareApplication + FAQPage JSON-LD (FAQ built from rendered data, no fake ratings); one `<h1>` per page; the sitemap lists the 13 public URLs and excludes login and dashboard; favicon set and apple icon; pages server-render (client components still SSR).

---

## 6. Admin panel (Phase 3): gap and reference

- **Gap:** no admin panel exists. **Built in Phase 3**; see the Phase 3 change log below.
- **Reference implementations found locally:** Lawzer `Documents/Lawzer/L-C-MS-main` and Regulane `Documents/Regulane International`.
- **Neither has granular permission-key RBAC.**
  - Lawzer: `platformRole` NONE/ADMIN/OWNER plus 7 capability flags; the root owner comes from `ADMIN_EMAIL`; non-admins get a 404; MFA is required; zod validation; server offset paging; `{error}` responses.
  - Regulane: a single admin flag; append-only `platform_events`; `useConfirm` dialogs; left-rail layout.
- **Structural blocker:** the brief assumes organisations, members, seats and per-org roles. **MADBOT has none of these**, so the open questions must be settled before Phase 3.

### Decisions (Siddhant, 2026-10-14)

1. **Real organisations.** Add `orgs/{orgId}` with members, invites and seats. Every existing account migrates into a one-person org it owns.
2. **Permission-key RBAC.** Keys such as `users.read` and `licenses.manage`, with roles composed from keys. Lawzer's Owner and Admin are kept as built-in roles.
3. **Plans stay in code** (`lib/plans.js`). Admins issue, extend, upgrade and revoke licences against the published plans, with per-org overrides.
4. **TOTP required for admin console access.** App-level, using Node crypto, with no new dependency.
5. **Unbacked marketing claims** are rewritten to match what the code does, not built out, unless told otherwise.
6. **Allowances are per account**, shared across every site the plan covers, rather than per site.
7. **Building a buyer profile and drafting AI-visibility questions cost credits.**
8. **One free trial per custom email domain** every 30 days. Public mail providers are exempt.

---

## Summary by severity

Updated after Phase 1: S-5 was raised to Critical, S-13 was retracted, and S-25, F-22 and F-23 are new.

| | Critical | High | Medium | Low |
|---|---|---|---|---|
| Fake data | 0 | 4 | 7 | 5 |
| Security | 3 | 5 | 9 | 6 |
| Functionality | 0 | 7 | 11 | 5 |
| UI / a11y | 0 | 3 | 6 | 1 |
| SEO | 0 | 0 | 5 | 4 |
| **Total** | **3** | **19** | **38** | **21** |

**Security after Phase 1:**
- **Fixed:** all 3 Critical and all 5 High.
- **Partly fixed, with the remainder deferred:**
  - S-6 (credit metering is a pricing question);
  - S-8 (sign-in limits are Firebase console configuration);
  - S-17 (the trial policy is a business rule).
- **Mitigated, rules deferred to Phase 3:** S-10.
- **Deferred:** S-23, which is your file.
- **Accepted, dev-only:** S-25.
- **Retracted:** S-13.

---

## Phase 1 change log (2026-10-14)

**New files**
- `lib/apiGuard.js`: body size limits and zod schemas; identity checks through the Admin SDK with revocation; a pure `identityVerdict()` (verified email, recent sign-in); a Firestore-backed `rateLimit()` with named `LIMITS`; constant-time `secretMatches()`; and `failure()`, which logs the error and returns a plain message.
- `lib/siteLimits.js`: which sites a plan covers (the oldest `maxSites`), `SITE_ID`, and `siteForPaidWork()`. The cron and `reserve()` share it.
- `lib/htmlTags.js`: a linear-time tag scanner for untrusted HTML.
- `eslint.config.mjs`: the Next 16 flat config.
- Tests:
  - `tests/redos.test.mjs` (30 cases);
  - `tests/licenseEnforcement.test.mjs` (17 cases);
  - `tests/apiGuard.test.mjs` (28 cases, which call the real route handlers in-process).

**Changed: metering, auth and parsing**
- `lib/costControl.js`: the pure `checkAllowance()`; a transactional `reserve()` with the site gate and the account-wide ledger; `record()` also updates the ledger.
- `lib/licenseServer.js`: verification now goes through `verifyIdentity()`.
- `lib/htmlParse.js`, `lib/audit.js`, `lib/leadEngine.js`, `app/api/read-site`: every hostile-HTML read now uses the linear scanner. Output is unchanged; all 94 existing parser cases pass.
- `lib/email.js`: `escapeHtml()`, applied to the greeting, the site URL and the verification link.
- `lib/digest.js`: accepts a server-side `activityCount`.

**Changed: routes**
- All 22 routes that take input now validate it with schemas; each is listed with its item above.
- Rate limits were added to every route except the cron, webhook and region routes.
- `jobs/run` and `send-digest` were rewritten. `privacy/export` is now a POST, and `privacy/delete` requires a recent sign-in.
- The crons page through all their documents and schedule fairly.

**Changed: client, rules and config**
- Dashboard:
  - `page.js` now sends `siteId` instead of the intelligence object and digest HTML.
  - `AccountData.js` downloads the export as a blob and offers "Sign in again" for deletion.
- `firestore.rules` gained explicit blocks for `users/{uid}/usage` and `rateLimits`. **Not yet deployed;** both paths were already denied by the catch-all.
- `tests/firestore-rules.test.cjs`: 25 new cases, 360 in total, all passing on the emulator.
- `tests/crawler.test.mjs`: the S-13 case now tests behaviour rather than source text.
- `tests/_resolve-hooks.mjs`: resolves package subpaths such as `next/server`, so route handlers can be imported in tests.
- `package.json`:
  - `next` upgraded to 16.3.8;
  - added the `@grpc/grpc-js` override;
  - added `zod`, which was already installed through the Anthropic SDK;
  - added the dev dependencies `eslint` 9 and `eslint-config-next` 16.3.8;
  - the `lint` script is now `eslint .`.
- `.gitignore`: covers every env file.
- `DEPLOY.md`: the pending rules deploy, the `rateLimits` TTL policy, and keeping the key file outside the repo.

**Verification at the end of the phase**
- **Build:** `next build` passes.
- **Tests:** `npm test` gives 791 passed, 3 failed and 1 skipped. The 3 failures are F-18 and F-19, which existed before this phase.
- **Rules:** `npm run test:rules` gives 360 of 360 on the emulator.
- **Dependencies:** `npm audit --omit=dev` reports 0.
- **Lint:** `npm run lint` reports 23 errors, all in existing UI code (F-23).
- **Live checks against the local dev server:**
  - the cron dry run against production, which read data only and changed nothing;
  - `read-site` on stripe.com;
  - a full `/api/audit` of getmadbot.com, with 28 findings.

**Side effect to know about:** the dev server shares the production Firebase project. The API suite and the live checks therefore wrote a few rate-limit counter documents (hashed keys, one-hour expiry) into the production `rateLimits` collection.

### Open questions from Phase 1 (answered 2026-10-14; see Decisions 6–8)

1. **Are allowances per site or per account?** Billing says "This month on this site", so a Growth account can use 3 × 1,450 actions. That behaviour is kept, and the new account ceiling makes it the most an account can use. If allowances were meant per account, the ceiling becomes the allowance itself.
2. **Should building a buyer profile and drafting visibility questions cost credits?** Both are cheap single calls and are currently free but rate limited.
3. **Trial abuse through one custom domain** (`a1@`, `a2@`, … on a domain the person owns): should there be a limit, such as one trial per domain per month outside the major free-mail providers?

---

## Phase 2 change log (2026-10-14)

**The three decisions (Phase 1 open questions)**
- **Per-account allowances:**
  - `lib/costControl.js`: `checkAllowance()` measures the account. `reserve()` seeds the month's account ledger from the per-site counters the first time, so the switch hands out no fresh allowance.
  - `lib/sites.js`, `app/dashboard/page.js`: `subscribeUsage` reads the account ledger, summing the per-site counters until it is seeded.
  - `Billing.js` now reads "This month on your account".
  - `firestore.rules`: the owner can read `users/{uid}/usage`.
  - Terms, Refunds and the pricing page say allowances are per account.
- **Credits for the two cheap AI calls:**
  - `lib/credits.js`: `BUYER_PROFILE` and `VISIBILITY_QUESTIONS` at 2 credits each. That is the estimator's pessimistic figure, flagged in the file to be replaced once a call has been measured.
  - `leadEngine` and `aiVisibility` return token usage; the two routes reserve and record.
- **One trial per custom domain:**
  - `lib/trialLedger.js`: `domainLedgerKey`, `domainTrialTaken` and the free-mail list.
  - `start-trial` has a third gate; `AccountNotices.js` gives a message for it.
  - `firestore.rules`: `trialDomains` is server-only.
  - The Privacy Policy now also discloses the plain-text email domain that the address ledger has always stored.

**Fake data**
- `scripts/prune-seeded-data.cjs` replaces `scripts/prune-seeded-approvals.cjs`, which is deleted.
- `tests/seedPrune.test.mjs`: 9 cases, against the real historical seed code.

**Unbacked claims** (D-2 to D-16 above)
- Pages: `app/page.js`, `app/about/page.js`, `app/pricing/page.js`, `app/layout.js`, `app/login/page.js`.
- Components: `app/components/AuditModal.js`, `app/dashboard/OnboardingModal.js`, `app/dashboard/screens/Billing.js`, `app/dashboard/panels/DigestPanel.js`.
- Libraries: `lib/autonomyDial.js`, `lib/plans.js`, `lib/digest.js`.
- Legal: `app/legal/{privacy,terms,refunds,subprocessors,cookies}`.

**Verification at the end of the phase**
- **Build:** `next build` passes.
- **Tests:** `npm test` gives 803 passed, 3 failed and 1 skipped. The 3 failures are F-18 and F-19, as before.
- **Rules:** `npm run test:rules` gives 370 of 370.
- **Lint:** 23 errors, the same pre-existing set (F-23).
- **In the browser:** the homepage and pricing page text, the prices resolving, and a live free report on example.com rendering with "How to fix" labels.
- **Not checked live:** the dashboard screens (onboarding, Billing, digest), which need a signed-in account.

**Your actions**
- Run `node scripts/prune-seeded-data.cjs` (dry run), read the list, then add `--confirm`.
- Deploy the rules: they now include `trialDomains` and owner read on `users/{uid}/usage`. **Billing's usage panel needs this deploy to read the account ledger.**
- Decide whether to keep the Mumbai sofa example (TODO on `app/page.js`).
- The legal changes (Terms, Refunds, Privacy) have not been reviewed by a lawyer, like the rest of those documents.

---

## Phase 3 change log (2026-10-15)

Two more decisions were taken during this phase:
- **Seats = sites** on every plan: Free 1, Starter 1, Growth 3, Pro 10, Agency 25.
- **Branding stays in `lib/company.js`**, not in the console, so the legal pages and the console can't disagree.

**Organisations and roles** (decisions 1 and 2)
- `lib/rbac.js`: the permission keys (14 platform, 10 org) and the built-in roles.
  - Platform: Owner, Admin, Support. Org: Owner, Admin, Member, Viewer.
  - `validateRole` allows one scope's keys only.
  - `canActOnAdmin` applies Lawzer's rule: nobody acts on an owner or on themselves.
- `lib/orgs.js`: `orgs/{orgId}` with `members`, `invites` (hashed tokens, 14-day expiry, a seat held while pending) and `licenseHistory`.
  - `ensurePersonalOrg` migrates an account lazily on its first request. The org id is the account's uid, so its data root doesn't move and no migration script is needed.
  - `orgContext` resolves the active org from server-written membership, never from the request.
  - Also: `transferOwnership`, `changeMemberRole`, `removeMember`, `acceptInvite`.
- **Product routes:** every one now goes through `licenseServer.authorize(idToken, feature, {permission})`.
  - Data paths and metering use `auth.orgId`; rate limits stay per person.
  - Connecting integrations needs `integrations.manage`.
  - Publishing needs `publish`.
  - Search Console and the digest need `sites.read`.
- **Client:**
  - `app/providers/OrgProvider.js` and `/api/orgs/me` give the org, role, permissions and switcher.
  - `app/dashboard/page.js` reads `orgId` everywhere it read `user.uid`, and has a screen for a suspended or missing org.
- **Invitations:** `app/invite/` and `/api/orgs/invites/accept`.
  - The invited address must be the one signing in, and it must be confirmed.
  - `/login?next=/invite?…` brings people back to the invite. It is the only `next` path honoured, so it can't be used as an open redirect.
- `firestore.rules`: rewritten around `can(orgId, permission)`, which reads the member's role document. Orgs, roles and every console collection are server-only. Signups can be closed.

**Licences** (decision 3)
- `lib/licenses.js`: issue, update and revoke a licence on `orgs/{orgId}.subscription`. Each change is written to `licenseHistory`.
- `lib/entitlements.js`:
  - `activePlan` honours `startsAt`.
  - `withOverrides` applies per-org limits and feature add/remove, and ignores malformed values.
  - `seatAccess` counts members plus pending invitations.
- `lib/billingAdmin.js` (the existing `/api/billing/grant`) writes the same licence.

**The console** (`/admin`, decision 4)
- **Auth** (`lib/totp.js`, `lib/adminAuth.js`, `/api/admin/session`):
  - A Firebase session cookie (8 hours, `__Host-` in production) plus an HMAC-signed second-factor cookie.
  - RFC 6238 TOTP via `node:crypto`, with replay protection. The secret is AES-256-GCM encrypted under `ADMIN_SECRET_KEY`.
  - A sign-in older than 5 minutes is refused, as is a mutation from another origin.
  - Someone who isn't an admin gets a 404, not a 403.
  - Enrolment shows a setup key and an `otpauth://` link, not a QR code: drawing one would have meant a new dependency.
- **Enforced three times:**
  - `proxy.js` turns away requests without the cookies.
  - `app/admin/(console)/layout.js` verifies the session, the second factor and the role on every render.
  - `lib/adminApi.adminRoute` does the same, plus the route's own permission, on every `/api/admin` call.
- **Sections:**
  - Dashboard.
  - Users, and a page per user: suspend, reactivate, soft delete with a typed confirmation, force a password reset, org membership.
  - Organisations, and a page per organisation: rename, suspend, transfer ownership, members, invitations, the licence editor with overrides, per-org flags, usage, sites, licence history.
  - Roles & permissions: custom roles. Deleting one is refused while anyone holds it.
  - Licences & plans: the catalogue is read-only and comes from `lib/plans.js`.
  - Feature flags: kill switches, enforced in `authorize` and in the cron.
  - Usage & billing: per-org meters, with an 80%/100% alert filter.
  - Audit log: search, filters, pagination, CSV export with formula injection defused.
  - Settings: signups open or closed, maintenance mode, wording for the welcome and verification emails.
  - System health: configuration, a live Firestore round trip, each cron's last run, the error log.
  - Admins: grant, revoke, reset an authenticator.
- **Across every page:**
  - Destructive actions go through a confirm dialog that traps focus and closes on Escape. The most destructive ones need the name typed.
  - Every mutation writes `adminAudit` with the actor, their role, their IP, and the values before and after. Entries can't be edited or deleted.
  - Paging is server-side and cursor-based.
  - The left rail becomes a scrolling top bar on a phone, and tables scroll inside their own box.
- **Platform services:**
  - `lib/platform.js`: settings and flags, cached 30 s.
  - `lib/adminAudit.js`: `errorLog`, which `apiGuard.failure()` now feeds, and `systemRuns`, which both crons write.
- **Closed signups now apply everywhere** (found while building Settings).
  - **The bug:** `ensurePersonalOrg` didn't check the setting, so a new account could still get a workspace through `start-trial` or any product route while signups were closed.
  - **The fix:** it now refuses a brand-new account.
  - An existing customer is still migrated, meaning one with a profile or a licence. A bare user document proves nothing, because `send-verification` creates one.
  - An admin acting from the console bypasses the check.

**Tests added**
- `tests/adminConsole.test.mjs` (30 cases, no network):
  - Roles: validation across scopes, including prototype-key names; the Owner/Admin/Support split; `canActOnAdmin`.
  - Licences: start dates, overrides, the autonomy clamp, features, seats = sites, a pending invitation holding a seat.
  - The 2FA cookie: forged, tampered, expired, someone else's, signed with another key.
  - Secrets at rest: encrypted, tampering detected; the console off without a key; `requireAdmin` answering 503 when unconfigured.
  - Audit filters, CSV escaping and flag precedence.
- `tests/adminGuard.test.mjs` (11 cases, against the dev server):
  - All 14 `/api/admin` reads are refused without cookies and with forged ones.
  - All 10 mutations are refused from another origin and without a real session.
  - Console sign-in is refused cross-origin and with a junk token.
  - Console pages redirect to sign-in.
  - `/admin/login` and `/invite` are noindex, and robots.txt disallows `/admin`.
- `tests/firestore-rules.test.cjs`: an "Organisations and roles" group, run against the role documents the server really writes.
  - A Viewer can read but not write.
  - A role without `approvals.decide` can't approve, or create something already approved.
  - A role without `sites.manage` can't create or delete a site.
  - A suspended org is read-only.
  - A former owner loses write after a handover.
  - Outsiders can't read an org.
  - Nobody writes orgs, licences, memberships or roles from a browser.
  - Closed signups refuse a new profile.

**Verification at the end of the phase**
- **Build:** `next build` passes, including every console page and `/api/admin` route.
- **Tests:** `npm test` gives 851 passed, 3 failed and 2 skipped, with the dev server running.
  - The 3 failures are F-18 and F-19, as before.
  - The 2 skips are the urlGuard one from before and the in-process origin check. That check needs the service account, and `adminGuard` covers it live.
- **Rules:** `npm run test:rules` gives 423 of 423.
- **Lint:** 23 errors, the same pre-existing set (F-23). Phase 3 code adds none: the eight it did add were fixed (state set inside effects, and two unescaped apostrophes).
- **In the browser:** `/admin/login` and `/invite` render at desktop width and at 375 px, with no horizontal scroll. The invite link's sign-in round trip passes the `next` check.
- **Not checked live:** the signed-in console pages, and the dashboard as an invited member. Both need you to sign in and enter a TOTP code, which I can't do for you.

**Your actions**
- Set `ADMIN_SECRET_KEY` in Vercel (Production): 32+ random characters, different from the local one I put in `.env.local`.
- Deploy the code, **then** publish the rules straight away. The order matters; DEPLOY.md section 3 explains why.
- ~~Add TTL policies~~ Not needed. TTL needs billing, and the project is on the free plan, so the daily retention cron now deletes expired `rateLimits`, `errorLog` and `systemRuns` rows itself (`lib/expiry.js`, at most 5,000 per run, tested in `tests/expiry.test.mjs`). This was decided on 2026-10-15.
- Sign in at `/admin/login` and set up your authenticator (DEPLOY.md section 6b).
- **Still open from Phase 2:**
  - Run the seed prune script.
  - Move the service-account JSON out of the repo.
  - Decide about the Mumbai sofa example.

---

## Phase 4 change log (2026-10-15): SEO

**Changed**

- **Indexing:**
  - `app/robots.js` disallows only `/api/`, so the private pages' noindex can be seen. The `host` line is gone.
  - `proxy.js` adds `/maintenance` to the pages that get `X-Robots-Tag: noindex`.
  - `app/dashboard/layout.js` is new.
- **The 404:** `app/not-found.js`.
- **Head tags:**
  - `app/layout.js`: `next/font`, `viewport.themeColor`, `og:url` on the www host, and a homepage description of 155 characters or fewer.
  - `app/manifest.js`.
  - Seven descriptions trimmed: about, pricing, terms, privacy, cookies, dpa, subprocessors.
- **Weight:**
  - `public/opportunity-graph.webp`.
  - `AuditModal` loaded on demand.
  - 11 files no longer `use client`.
  - `app/components/ConsentButton.js`.
- **Structured data and dates:**
  - BreadcrumbList in every legal layout.
  - `lib/legalDates.js` feeds the pages and the sitemap.
  - The stale "client component" comments in the layouts and `lib/seo.js` are corrected.
- **CSP:** `proxy.js` no longer allows Google Fonts.
- **Content:** the Security page (D-17).
- **Bug fixed on the way:** `/api/read-site`'s error messages (F-24).

**Tests added**

`tests/seo.test.mjs` (11 cases, against the dev server) covers:
- **robots.txt:** only the API is disallowed, the sitemap is named, there is no host line.
- **The sitemap:** 13 URLs on the canonical host; legal pages carry `lastmod` matching `lib/legalDates.js`, and the others carry none.
- **Private pages:** dashboard, login, console sign-in, invitation and maintenance all send both noindex signals. The dashboard has its own title and no canonical.
- **The 404:** a real 404 with our page, links onward, noindex, no canonical and one title.
- **The homepage head:** `og:url` on www; no Google Fonts in the HTML or the CSP, and a self-hosted woff2 preloaded; two theme-color tags.
- **The manifest:** served, and every icon in it resolves.
- **Every public page:** a description of 155 characters or fewer.
- **Every legal page:** a three-step breadcrumb, and it shows the same date the sitemap sends.

Also: a `describeFetchFailure` case in `urlguard.test`. The robots check in `adminGuard.test` moved to `seo.test`, since the rule changed.

**Verification at the end of the phase**
- **Build:** `next build` passes.
- **Tests:** `npm test` gives 867 passed, 3 failed and 2 skipped. The 3 failures are F-18 and F-19, as before.
- **Lint:** 23 errors, the same pre-existing set (F-23).
- **In the browser:**
  - Both fonts load from `/_next/static/media`, with Caprasimo on headings and Figtree on the body.
  - The 404 page renders.
  - On the now server-rendered `/legal`, "Manage cookie preferences" still opens the consent dialog.

**Left for you:** none of this is live until the deploy. On the live site, after the deploy:
- Resubmit the sitemap in Google Search Console.
- Use URL Inspection on `/dashboard` to let Google see the new noindex.
