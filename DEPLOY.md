# Deploying MADBOT

Everything below is what the code actually reads (grep `process.env.` in `app/` and
`lib/`) and what Firebase needs for those reads to succeed. Nothing here is optional
unless marked so.

## 1. Vercel → Settings → Environment Variables

Set each for **Production** and **Preview**. Names must match exactly.

### Firebase (client) — Firebase console → Project settings → Your apps → Web app → SDK config

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` (`madbot-256aa.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` (`madbot-256aa`) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is in the local env but nothing reads it — harmless either way.

### Firebase (server)

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_B64` | The service account JSON for **this** project, base64 encoded as a single line. See below. |

**Check whether you need to do this at all.** Usually you do not:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/admin-status
```

`"admin":true` with `"projectId":"madbot-256aa"` means the service account already
works and this variable should be left alone.

If you do need to set it, get the file from Firebase console → Project settings →
**Service accounts** → Generate new private key. Check the `project_id` inside the file
says `madbot-256aa`. A key from a different Firebase project will authenticate fine and
then read an empty database, which fails in a confusing way rather than an obvious one.

Then encode it. **Replace the path with your own file** — these are not
copy-paste-ready until you do:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:/Users/you/madbot-key.json")) | Set-Clipboard
```

```bash
base64 -w0 madbot-key.json | pbcopy
```

The encoded value is now on your clipboard. Paste it into Vercel as the entire value,
with no line breaks and no surrounding quotes.

Without it every licence check refuses, the cron does nothing, and paid features stay
off.

**Treat the JSON as a password.** It grants full admin access to the project, bypassing
every Firestore security rule. Never commit it, never paste it into a chat, an issue or
a support ticket, and never email it. If it is exposed, revoke it immediately in Google
Cloud console → IAM & Admin → Service Accounts → Keys, then generate a replacement. The
`.gitignore` already covers `*firebase-adminsdk*.json`, `*serviceaccount*.json` and
`*service-account*.json`, but that only protects you from git.

### AI

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | A **new** key from console.anthropic.com → API Keys. **The key in `.env.local` today is rejected with 401 by every model** — `/api/ai-status` reports `state: "rejected"`. Until a valid key is set, article writing, AI visibility, lead qualification, social drafts, listing copy and outreach drafts all stay in planning-only mode and say so on screen. |

### Scheduler and admin

| Variable | Value |
|---|---|
| `CRON_SECRET` | Random, 32+ chars: `openssl rand -hex 32`. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron invocations when the variable is named exactly this. Unset = both cron endpoints refuse everyone. |
| `TRIAL_LEDGER_PEPPER` | Random, 32+ chars: `openssl rand -hex 32`. Salts the one-way hash that records which email addresses have used a free trial, so the ledger cannot be tested against a guessed address. Optional but wanted in production. **Never rotate it once trials exist** or every past trial is forgotten and everyone gets another one. |
| `ADMIN_UIDS` | Your Firebase uid(s), comma-separated. Firebase console → Authentication → Users → **User UID**. These accounts are the **owners** of the admin console at `/admin` (nobody can grant or remove owner from inside the console), and can grant plans by hand via `/api/billing/grant` — there is no card checkout yet, so with this unset nobody can be put on a paid plan, including you. |
| `ADMIN_SECRET_KEY` | Random, 32+ chars: `openssl rand -base64 36`. Encrypts the admin console's authenticator secrets at rest and signs its second-factor cookie. **Unset or shorter than 32 = the console is switched off** (every `/api/admin` route answers 503). Rotating it signs every admin out and makes every admin set up their authenticator again, so set it once. Use a different value from your local `.env.local`. |
| `GOOGLE_CLIENT_SECRET` | The client secret of the OAuth **Web client** MADBOT signs in with (Google Cloud → APIs & Services → Credentials, client `340416135340-hrcaa9q3…`). The server uses it to keep a lasting Search Console connection. **Unset = Search Console says it isn't set up.** Also needs `ADMIN_SECRET_KEY`, which encrypts the stored connection. |

### Email — resend.com

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Resend → API Keys. |
| `EMAIL_FROM` | `MADBOT <notify@getmadbot.com>` — `getmadbot.com` is already verified. Unset falls back to Resend's sandbox sender, which only delivers to your own Resend address. |
| `MARKETING_EMAIL_FROM` | `MADBOT <hello@mail.getmadbot.com>` — **`mail.getmadbot.com` currently has no DNS records.** Add it as a domain in Resend, publish the DKIM/SPF/MX records it gives you at your DNS host, wait for "Verified". Until then marketing mail refuses to send rather than borrow the transactional domain (by design — leave it unset if you're not ready). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `support@getmadbot.com` — shown in Billing and set as reply-to. Must be a real mailbox; verifying a domain for sending does not create one for receiving. |
| `RESEND_WEBHOOK_SECRET` | Resend → Webhooks → **Add endpoint** `https://<your-domain>/api/webhooks/resend`, select all `email.*` events (sent, delivered, opened, clicked, delivery_delayed, complained, bounced, failed), copy the **signing secret**. Unset = the endpoint refuses every event. |

### Optional — company registries (leads)

| Variable | Where |
|---|---|
| `DATA_GOV_IN_API_KEY` | **Indian companies.** The Ministry of Corporate Affairs company register (3.7 million companies: CIN, status, registration date, registered office, paid-up capital), published free on the Open Government Data platform. Register at data.gov.in, then My Account → generate API key. Free; the licence (Government Open Data License – India) requires attribution, which the Leads screen shows next to any company verified this way. |
| `COMPANIES_HOUSE_API_KEY` | developer.company-information.service.gov.uk (free), UK companies |
| `OPENCORPORATES_API_KEY` | opencorporates.com. **Paid for commercial use** (its free tier is for journalists, NGOs and researchers only), so leave it unset unless you buy a plan. |

All degrade honestly when absent — the Leads screen shows which sources are on. RDAP, Certificate Transparency, SEC EDGAR and **GLEIF** (the global LEI register, about 400,000 Indian entities, which also gives a company's CIN) need no key.

### Optional — social publishing

Each pair independently switches on a **Connect** button in the dashboard. Drafting works without any of them; posts simply wait for approval. Read by `lib/social.js` (`readiness(process.env)`).

| Variable | Notes |
|---|---|
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers/apps. App must be verified against a Company Page and granted the Community Management API. |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | developer.x.com. **Posting is not available on the free tier** — Basic or above. |
| `META_APP_ID` / `META_APP_SECRET` | developers.facebook.com/apps — one app covers Facebook Pages and Instagram. Instagram needs a Business account linked to a Page plus App Review for publishing. |

## 1b. Fill in `lib/company.js` before taking money

Every legal page reads the company's details from `lib/company.js`. While anything
`missingForLaunch()` checks is `null`, all eleven policy pages render a visible orange
banner saying the document is incomplete. That is deliberate: an incomplete policy that
looks complete is worse than one that admits what it is missing.

**This is now clear.** `missingForLaunch()` returns empty, the banners are gone, and the
registered office, CIN and grievance officer all publish. The only `MISSING_FOR_LAUNCH`
marker left is `gstin`, which must stay `null` until you are actually GST-registered.

| Field | Where to get it | Why it is required |
|---|---|---|
| ~~`cin`~~ | Done: `U62011MH2026PTC475385` | Companies Act 2013 s.12(3)(c) requires the CIN on letterheads, invoices and official publications |
| ~~`pan`, `tan`~~ | Done | Needed on invoices and for TDS. Deliberately not rendered on any public page: a tax id belongs on an invoice, not in a footer |
| ~~`registeredOffice`~~ | Done: Santacruz (East), Mumbai 400055 | Consumer Protection (E-Commerce) Rules 2020 require the seller's legal name and registered address to be published; GDPR Art 13 requires the controller's identity |
| `gstin` | GST portal | **Leave null until actually GST-registered** — an invoice showing tax you are not registered to collect is a false document |
| ~~`grievanceOfficer`~~ | Done: Siddhant Mallah, with email and telephone | Consumer Protection (E-Commerce) Rules 2020 and IT Rules 2021 both require a named grievance officer with a published contact. The 48-hour acknowledgement and 30-day resolution commitment are published alongside |
| `emails.privacy`, `.security` | Mailboxes you create | Both fall back to `NEXT_PUBLIC_CONTACT_EMAIL`, which is set, so the pages do render a working address. Dedicated inboxes are nicer but not blocking. `legal` and `grievance` already point at `contact@mallahsoftware.com`, whose domain has live MX records |
| `euRepresentative`, `ukRepresentative` | Only if you appoint one | GDPR Art 27 requires an EU representative for a non-EU controller offering services to people in the EU, unless processing is occasional and low-risk. The Privacy Policy currently states plainly that none is appointed |

## 1c. Legal review

The eleven documents under `/legal` were written against what the code actually
does, and they deliberately state what is not in place (no ISO 27001, no SOC 2,
no penetration test, no EU representative, no transfer impact assessment). They
have not been reviewed by a lawyer. Have them reviewed before launch, in
particular the liability cap, the governing-law clause and the refund windows.

## 2. Vercel → Cron Jobs

Already declared in `vercel.json` and picked up on deploy:

| Path | Schedule | Does |
|---|---|---|
| `/api/cron/tick` | `0 */6 * * *` | Schedules due audits, crawls, competitor snapshots, opt-in AI visibility re-checks |
| `/api/cron/retention` | `0 3 * * *` | Purges leads past each site's retention window |

**If the project is on the Vercel Hobby plan**, crons are limited to once a day and `0 */6 * * *` will be rejected at deploy — change it to `0 6 * * *` or upgrade to Pro. Both endpoints check `CRON_SECRET`.

## 3. Firebase console

### Authentication → Sign-in method
Enable **Email/Password**, **Google**, **GitHub**.

- GitHub needs an OAuth App at github.com/settings/developers → New OAuth App, with **Authorization callback URL** `https://madbot-256aa.firebaseapp.com/__/auth/handler`. Paste its Client ID and Client Secret into the Firebase GitHub provider.

### Authentication → Settings → Authorized domains
Add every domain the app is served from: `<project>.vercel.app`, `getmadbot.com`, `www.getmadbot.com`. Sign-in popups fail with `auth/unauthorized-domain` on any domain not listed, **and `generateEmailVerificationLink` fails too**, so email confirmation stops working on an unlisted domain.

### Email verification
The confirmation link points at whichever domain the request arrived on, so **every domain must be in Authorized domains above**, including the apex if it serves traffic. Note `getmadbot.com` currently 308-redirects to `www.getmadbot.com`, so `www` is the canonical host and the one that matters most.

New email and password signups must confirm their address before their free trial starts. The link is generated by the Admin SDK but the message is sent through Resend on the verified domain, so nothing needs configuring in Firebase's own email templates. Google and GitHub sign-ins arrive already verified and skip the step. Confirm after deploy by signing up with a real address and watching for the message; if it does not arrive, check `EMAIL_FROM` and whether the Resend domain is verified.

### Google Cloud console (same project) — for Search Console
The Search Console connection asks for `https://www.googleapis.com/auth/webmasters.readonly`.
1. APIs & Services → **Library** → enable **Google Search Console API**.
2. APIs & Services → **OAuth consent screen** → add that scope. While the app is in *Testing*, only listed test users can grant it; publish to *Production* for customers (it is a sensitive scope, so Google will ask for verification).
3. APIs & Services → **Credentials** → the Web client → **Authorized redirect URIs**, add:
   - `https://www.getmadbot.com/api/search-console/callback`
   - `http://localhost:3000/api/search-console/callback` (local development)

   Then copy that client's secret into `GOOGLE_CLIENT_SECRET` (Vercel and `.env.local`).

How it works: connecting sends the person to Google and back to the callback. The server swaps Google's code for a refresh token, stores it encrypted at `orgs/{orgId}/integrations/searchConsole` (no client can read it), and mints hour-long access tokens from it. The connection is per workspace and survives refreshes. Each site remembers its own property (`gscProperty`). Disconnect revokes it at Google. If the person revokes access in their Google account, the next request finds out and shows "Connect" again.

### Firestore
1. Build → Firestore Database → **Create database** (production mode). Pick the region closest to your Vercel region.
2. Publish the rules in `firestore.rules`. Either paste the file into Firestore → **Rules** → Publish, or from the repo:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase init firestore   # existing project madbot-256aa; keep firestore.rules; accept the default indexes file
   firebase deploy --only firestore:rules
   ```
   **Already deployed.** The live ruleset is `ec81f6bf-a267-43c6-9b47-ebcca5aedc22` and matches `firestore.rules` byte for byte, verified by reading it back. It was previously stuck on `029bd549-0d4b-4105-9581-dedb897b9fd5`, which had no rules for `social/` or `listings/`, so both screens were getting permission-denied in production. To roll back, release that older ruleset id again.

   Redeploy after any change to `firestore.rules`. Forgetting is silent: the code ships, the screen reads nothing, and no error appears anywhere except the browser console. That is why there is now a script for it, which reads the live ruleset back after publishing rather than trusting the write:

```bash
npm run test:rules && node scripts/deploy-firestore-rules.cjs --publish
```

   Run it with no flag first for a dry run that shows which collections gained or lost rules. It prints a rollback command using the previous ruleset id. `npm run test:rules` needs no credentials and no network, and it is the only thing that tells you whether the rules do what you think: 423 cases covering cross-user isolation and every privilege-escalation path.

   **Pending as of 2026-10-15, and this one is not optional.** Phase 3 rewrote the rules around organisations: every read and write under `users/{orgId}/…` now checks the person's membership of `orgs/{orgId}` and their role's permissions, and the dashboard reads the plan from `orgs/{orgId}`. Order matters:
   1. Deploy the code first. Each account's own organisation is created on its first request to the new code (`/api/orgs/me`, which the dashboard calls before anything else), with the same id as the account, so its sites stay where they are.
   2. Then publish the rules straight away. Until you do, the Billing screen can't read the plan (the old rules deny `orgs/`) and invited members can't read anything.
   Publishing the rules *before* the code would lock everyone out: the new rules need the organisation documents that only the new code creates. If that happens, roll back the rules with the command the script prints.
3. Indexes: **none required.** Every client query is a single-field `orderBy`; the cron's collection-group reads are paged by document id with a field projection, which Firestore serves without a custom index (checked against production with `/api/cron/tick?dryRun=1`). If Firestore ever logs a "requires an index" error it will include a one-click link.
4. **Expiring records: nothing to set up.** Three collections hold short-lived rows with an `expiresAt` field:
   - `rateLimits`: request counters, an hour after their window;
   - `errorLog`: server errors shown under System health, 30 days;
   - `systemRuns`: each scheduled job's run, 30 days.

   The daily retention cron deletes them once they're past `expiresAt` (`lib/expiry.js`). It deletes at most 5,000 rows a run so it can't use up the free plan's 20,000 writes a day; anything left goes on the next run, and the run's summary under System health says if it stopped early.

   **Why not Firestore TTL policies?** They need billing on the project, and `madbot-256aa` is on the free Spark plan. If you move to Blaze, you can add TTL policies on `expiresAt` for those three collection groups as well; the cron then simply finds nothing left to delete.

   Two things not to do:
   - Don't exempt `expiresAt` from indexing: the sweep queries it.
   - **Never** add a TTL policy, or anything else that deletes, for `adminAudit`. The audit log is meant to be permanent, and it has no `expiresAt` for that reason.

### Service account
Project settings → Service accounts → Generate new private key → base64 → `FIREBASE_SERVICE_ACCOUNT_B64` (section 1).

Keep the downloaded `.json` key **outside the repository folder**. `.gitignore` covers it, but a key that only `.gitignore` stands between and a commit is one `git add -f` away from being public. Every script here reads `FIREBASE_SERVICE_ACCOUNT_B64` from `.env.local`, so nothing needs the file in the repo.

## 4. Smoke test after the first deploy

```bash
curl -s https://<your-domain>/api/ai-status
# want: {"state":"ready", ...}   — "rejected" means the Anthropic key is bad
```
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/admin-status
# want: {"ok":true,"admin":true,"cronSecretSet":true, ...}
# 401 without the header is correct — this endpoint is not public
```
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/tick
# want: {"ok":true, ...}
```
```bash
curl -s "https://<your-domain>/api/audit?url=example.com" | head -c 200
# want: {"ok":true, ... a real report
```

```bash
curl -s -o /dev/null -w "%{http_code}
" https://<your-domain>/legal/privacy
# want: 200 — and the same for /legal/terms, /legal/cookies, /about, /contact
```

Then sign in with Google on the live site, connect one real website, and let the onboarding crawl run — that exercises Firestore rules, the service account, and the job engine end to end.

## 5. Compliance checks after deploy

- **Cookie notice.** Open the site through a VPN in an EU country and confirm the banner asks before anything optional runs; open it from the US and confirm it offers an opt-out instead. The model is chosen in `lib/consent.js` from the country header Vercel adds, so it only works correctly once deployed behind Vercel's edge. On localhost there is no country header and it fails safe to opt-in.
- **Global Privacy Control.** With a browser or extension that sends GPC, the banner should never appear and the stored record should say `"method":"gpc"`.
- **One trial per person.** Sign up, confirm the address, then delete the account from Billing and sign up again with the same address. The second account should land on the free plan with the "No trial on this account" notice. A `+tag` or extra dots in a Gmail address should not defeat it.
- **Data export and deletion.** Both live on the Billing screen. The export downloads a JSON file; deletion requires typing a confirmation phrase and is irreversible.
- **Regional pricing.** `/pricing` should default to the local currency in India, the US, the EU, the UK, the UAE and Singapore, and to USD everywhere else. Adding a country is one line in `app/api/region/route.js`.

## 6. Maintenance scripts

`scripts/prune-orphan-users.cjs` deletes Firestore user documents whose Firebase
Auth account no longer exists. These accumulate from accounts removed through the
Firebase console rather than through the product, and each one is personal data
belonging to somebody who no longer has an account. The in-product delete route
removes both, so nothing new should orphan.

Dry run, which is the default:

```bash
node scripts/prune-orphan-users.cjs
```

Then, once you have read the list:

```bash
node scripts/prune-orphan-users.cjs --confirm
```

It refuses to touch any orphan that holds a subscription record, since that is the
one signal it might have been a real customer. Deletion is recursive and cannot be
undone.

`scripts/prune-seeded-data.cjs` removes the fabricated leads, content, activity
and approvals that the signup seed wrote into real accounts on 22 and 23 August
2026. The seed is long gone from the code, but the records it wrote are still in
those accounts until this runs: invented companies on the Leads screen, an
invented content calendar, claims of work never done in the Activity log, and
pending decisions about work that never existed. Each matcher needs both the
seed's text and a structural mark no real record has
(`tests/seedPrune.test.mjs` proves it against the seed code itself, pulled
from git). **Not yet run against production as of 2026-10-14.** Dry run first:

```bash
node scripts/prune-seeded-data.cjs
```

Then, once you have read the list:

```bash
node scripts/prune-seeded-data.cjs --confirm
```

## 6b. The admin console (`/admin`)

1. Set `ADMIN_UIDS` (you) and `ADMIN_SECRET_KEY` in Vercel, redeploy, and publish the rules (section 3).
2. Open `https://www.getmadbot.com/admin/login` and sign in with the same account as on the dashboard. The console asks you to confirm who you are even if you're already signed in: a sign-in older than five minutes isn't accepted.
3. The first time, it shows a setup key (and an `otpauth://` link that opens an authenticator app on a phone). In your authenticator app (Google Authenticator, 1Password, Authy…) choose "enter a setup key", paste it, then type the six-digit code. There is no QR code: drawing one would have meant a new dependency. From then on every console sign-in needs a code. Sessions last 8 hours.
4. To let someone else in: they sign up for a normal MADBOT account first, then Admins → Grant access with their email and a role (Admin, Support or a custom role). They set up their own authenticator on first sign-in.
5. Lost your authenticator? Another owner can reset it from Admins. If you're the only owner, delete `totpSecret` from your `platformAdmins/{uid}` document in the Firestore console; your next sign-in enrols a new one.

Everything done in the console is in its audit log (Audit log, exportable as CSV). Entries can't be edited or deleted from the console or from any browser.

## 7. The site's own SEO

MADBOT sells search visibility, so its own site should pass its own audit. Point the
free report at `https://www.getmadbot.com` after any deploy that changes the marketing
pages. `app/robots.js` and `app/sitemap.js` generate `/robots.txt` and `/sitemap.xml`,
canonicals resolve per page from the root layout, and `Organization` plus `WebSite`
structured data is emitted site-wide from `app/layout.js`.

Adding a public page means adding one line to `app/sitemap.js`. That is deliberate: a
filesystem-generated sitemap would silently list the next page somebody adds, whether
or not it should be indexed.

## 8. Advertising: none, and why

There is no ad network on this site, and the Advertising consent category is
empty. Google AdSense was live here briefly at publisher id
`ca-pub-2309671102557521` and has been removed — loader, verification meta tag
and `/ads.txt` with it.

**Google refused the site**, for "low value content". That verdict was correct.
Of the thirteen URLs in the sitemap, nine are legal notices and one is the login
screen; eighty-seven percent of the site's text is terms, privacy, DPA and
sub-processor boilerplate. AdSense buys inventory beside material people came to
read, and a product site has none. Passing a re-review would mean becoming a
publisher — a real section of original writing, deep enough that the policy
pages are a footnote — which is weeks of work for an ad network nobody wanted
here anyway.

Two reasons it was the wrong fit regardless of the refusal, both known before
the application went in:

- **Contextual ads on a page about marketing software mean competitors.** It
  puts other people's adverts beside your own pricing table, in front of a buyer
  who is deciding.
- **Google requires a certified consent management platform for EEA and UK ad
  serving.** The gate in this codebase is honest and enforced but is not on
  Google's list, so a large share of European impressions could not have served
  whatever a visitor agreed to. Not fixable in our own code.

Removing it had to undo the disclosures that adding it required, in the same
commit. The Cookie Policy and the Privacy Policy both declared that we share
personal information for cross-context behavioural advertising under the CPRA;
both now say we do not, because we do not. Google AdSense came off the
sub-processor list, the Advertising category went back to empty, and it is
hardcoded off in every jurisdiction rather than following the opt-out default —
defaulting a permission on for something that does not exist would pre-authorise
whatever got added next. `CONSENT_VERSION` went to 4, which invalidates every
stored answer: a stored `advertising: true` is a live authorisation and should
not outlive the thing it authorised.

The free report's own AdSense readiness section stays — that is a feature for
customers who do publish, and it now predicts this refusal rather than missing
it. See `lib/adsenseReady.js`.

If advertising is ever reconsidered, the order is the one `lib/consent.js`
describes: inventory entry and policy pages first, in the commit that adds the
script, never after.
