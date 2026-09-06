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
| `ADMIN_UIDS` | Your Firebase uid(s), comma-separated. Firebase console → Authentication → Users → **User UID**. Needed to grant plans by hand via `/api/billing/grant` — there is no card checkout yet, so with this unset nobody can be put on a paid plan, including you. |

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
| `COMPANIES_HOUSE_API_KEY` | developer.company-information.service.gov.uk (free) |
| `OPENCORPORATES_API_KEY` | opencorporates.com/api_accounts (free tier) |

Both degrade honestly when absent — the Leads screen shows which sources are on. RDAP, Certificate Transparency and SEC EDGAR need no key.

### Optional — social publishing

Each pair independently switches on a **Connect** button in the dashboard. Drafting works without any of them; posts simply wait for approval. Read by `lib/social.js` (`readiness(process.env)`).

| Variable | Notes |
|---|---|
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers/apps. App must be verified against a Company Page and granted the Community Management API. |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | developer.x.com. **Posting is not available on the free tier** — Basic or above. |
| `META_APP_ID` / `META_APP_SECRET` | developers.facebook.com/apps — one app covers Facebook Pages and Instagram. Instagram needs a Business account linked to a Page plus App Review for publishing. |

## 1b. Fill in `lib/company.js` before taking money

Every legal page reads the company's details from `lib/company.js`. While any of
these is `null`, all eleven policy pages render a visible orange banner saying the
document is incomplete, and the footer omits the missing lines. That is deliberate:
an incomplete policy that looks complete is worse than one that admits what it is
missing. Grep for `MISSING_FOR_LAUNCH`.

| Field | Where to get it | Why it is required |
|---|---|---|
| `cin` | Certificate of incorporation | Companies Act 2013 s.12(3)(c) requires the CIN on letterheads, invoices and official publications |
| `registeredOffice` | As filed with the Registrar of Companies | Consumer Protection (E-Commerce) Rules 2020 require the seller's legal name and registered address to be published; GDPR Art 13 requires the controller's identity |
| `pan`, `gstin` | Income tax / GST portal | Needed on invoices. **Leave `gstin` null until actually GST-registered** — an invoice showing tax you are not registered to collect is a false document |
| `grievanceOfficer.name` and `.email` | Your appointment | Consumer Protection (E-Commerce) Rules 2020 and IT Rules 2021 both require a named grievance officer with a published contact. The pages already publish the 48-hour acknowledgement and 30-day resolution commitment |
| `emails.support` / `.privacy` / `.legal` / `.security` | Mailboxes you create | Each falls back to `NEXT_PUBLIC_CONTACT_EMAIL`. With that unset too, the Contact page currently renders **zero working addresses** |
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

### Firestore
1. Build → Firestore Database → **Create database** (production mode). Pick the region closest to your Vercel region.
2. Publish the rules in `firestore.rules`. Either paste the file into Firestore → **Rules** → Publish, or from the repo:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase init firestore   # existing project madbot-256aa; keep firestore.rules; accept the default indexes file
   firebase deploy --only firestore:rules
   ```
   **New in this release:** rules for `users/{uid}/sites/{siteId}/social/*` and `.../listings/*`, plus a server-only `trialLedger/{emailHash}` collection. Until they are published, the Social and Listings screens get permission-denied on read and show nothing. The trial ledger is written by the Admin SDK, which bypasses rules, so it works either way, but the deny rule must be published so no client can read or clear it.
3. Indexes: **none required.** Every client query is a single-field `orderBy`; the cron's collection-group reads are unfiltered. If Firestore ever logs a "requires an index" error it will include a one-click link.

### Service account
Project settings → Service accounts → Generate new private key → base64 → `FIREBASE_SERVICE_ACCOUNT_B64` (section 1).

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
