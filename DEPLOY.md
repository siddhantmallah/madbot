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
| `FIREBASE_SERVICE_ACCOUNT_B64` | Project settings → Service accounts → **Generate new private key**, then base64 the whole JSON file as one line. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) \| Set-Clipboard`. macOS/Linux: `base64 -w0 key.json`. |

Without it every licence check refuses, the cron does nothing, and paid features stay off. Never commit the JSON — it is gitignored.

### AI

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | A **new** key from console.anthropic.com → API Keys. **The key in `.env.local` today is rejected with 401 by every model** — `/api/ai-status` reports `state: "rejected"`. Until a valid key is set, article writing, AI visibility, lead qualification, social drafts, listing copy and outreach drafts all stay in planning-only mode and say so on screen. |

### Scheduler and admin

| Variable | Value |
|---|---|
| `CRON_SECRET` | Random, 32+ chars: `openssl rand -hex 32`. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron invocations when the variable is named exactly this. Unset = both cron endpoints refuse everyone. |
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
Add every domain the app is served from: `<project>.vercel.app`, `getmadbot.com`, `www.getmadbot.com`. Sign-in popups fail with `auth/unauthorized-domain` on any domain not listed.

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
   **New in this release:** rules for `users/{uid}/sites/{siteId}/social/*` and `.../listings/*`. Until they are published, the Social and Listings screens get permission-denied on read and show nothing.
3. Indexes: **none required.** Every client query is a single-field `orderBy`; the cron's collection-group reads are unfiltered. If Firestore ever logs a "requires an index" error it will include a one-click link.

### Service account
Project settings → Service accounts → Generate new private key → base64 → `FIREBASE_SERVICE_ACCOUNT_B64` (section 1).

## 4. Smoke test after the first deploy

```bash
curl -s https://<your-domain>/api/ai-status
# want: {"state":"ready", ...}   — "rejected" means the Anthropic key is bad
```
```bash
curl -s https://<your-domain>/api/admin-status
# want: {"ok":true,"admin":true,"cronSecretSet":true, ...}
```
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/tick
# want: {"ok":true, ...}
```
```bash
curl -s "https://<your-domain>/api/audit?url=example.com" | head -c 200
# want: {"ok":true, ... a real report
```

Then sign in with Google on the live site, connect one real website, and let the onboarding crawl run — that exercises Firestore rules, the service account, and the job engine end to end.
