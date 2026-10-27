# Go live on Vercel with your first clients

Written 27 Oct 2026 for the first launch with two clients. Do the steps in order. Most of them work from a phone browser.

## What's ready, and what isn't yet

| | Status |
|---|---|
| Mock or sample data in the app | None. A new database starts empty; the only rows the setup adds are the plan limits the app needs. |
| Keys written into the code | None. Platform keys go into Vercel's settings. Each client pastes **their own** Meta and WhatsApp tokens in Settings, where they're stored encrypted (Supabase Vault). |
| Ad insights (spend, campaigns) | Work once a client pastes their Meta token. They sync every hour, plus a deeper sync twice a day. |
| Leads from lead forms | Arrive through the hourly sync. **Instant** leads need step 7. |
| WhatsApp bot | Needs step 7. Without it, the welcome goes out but the client's replies never reach LeadOS. |
| Billing | Not built. Clients get a 14-day trial; you extend it or set their plan in `/admin`. |
| "Continue with Facebook" | Not yet; it needs Meta App Review. Clients paste a token instead. |

## Decision: live and local share one Supabase project (27 Oct 2026)

The live site (`https://lead-os-rosy.vercel.app`) and your PC use the same Supabase project, which already has migrations 0001–0014. Because real client data now lives there:

- **Don't run `npm run inngest:dev` on your PC.** Local background jobs would work on live data. With `WA_DRY_RUN=1`, a local follow-up job marks real leads as messaged without sending anything, so the client's real follow-ups would be skipped.
- **Don't run `npm run test:int`.** It creates and deletes throwaway users and workspaces in that database.
- `npm test` (unit tests) and `npm run dev` are fine: they don't run background jobs.
- **Supabase → Authentication → URL Configuration:** Site URL `https://lead-os-rosy.vercel.app`; redirect URLs `https://lead-os-rosy.vercel.app/**` and `http://localhost:3000/**`.
- When you rotate the Supabase secret key, update it in both `.env.local` and Vercel.

Step 1 below is only for moving to a separate production project later.

## 1. A new Supabase project for production

Don't reuse the dev project: tests create and delete users there.

1. supabase.com → New project (region: Mumbai).
2. SQL Editor → New query → paste all of `leados-production-setup.sql` (every migration, in order) → Run. If it warns about a destructive operation, choose **Run this query**. It only replaces functions.
3. Authentication → URL Configuration:
   - Site URL: your Vercel address, e.g. `https://leados.vercel.app`.
   - Redirect URLs: add `https://<your address>/**`.
4. Authentication → Providers → Email: keep **Confirm email** on.
5. Project Settings → API: copy the URL, the publishable key and the secret key for step 3.

> Supabase's built-in email sends only a few emails an hour. That's enough for two clients signing up. Set up Resend before you invite more people (`LAUNCH-CHECKLIST.md`, section 3).

## 2. Inngest (background jobs)

1. inngest.com → sign up → create an app.
2. Copy the **Event key** and the **Signing key**.

## 3. Vercel

1. vercel.com → Add New → Project → import `adishshah29-eng/LeadOS`.
2. Before the first deploy, add these Environment Variables. A production build stops and names anything missing.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1.5 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from step 1.5 |
| `SUPABASE_SECRET_KEY` | from step 1.5 |
| `NEXT_PUBLIC_SITE_URL` | your Vercel address, e.g. `https://leados.vercel.app` |
| `META_APP_SECRET` | your own Meta app's secret (Meta app → Settings → Basic). Client app secrets are added in step 7. |
| `META_WEBHOOK_VERIFY_TOKEN` | any long random string; you'll type the same one in Meta |
| `META_API_VERSION` | `v23.0` |
| `INNGEST_EVENT_KEY` | from step 2 |
| `INNGEST_SIGNING_KEY` | from step 2 |
| `GEMINI_API_KEY` | optional: lets the bot understand typed replies |

**Do not add** `WA_DRY_RUN` or `INNGEST_DEV`. Those are for development only, and the build refuses them.

3. Deploy. Then open `https://<your address>/api/health`. It should say the database is healthy.
4. Inngest → your app → **Sync app** → URL `https://<your address>/api/inngest`.

## 4. Make yourself platform admin

1. Sign up on the live site with your own email and create your workspace.
2. Account → turn on two-factor login.
3. Supabase SQL Editor, using your email:

```sql
insert into public.platform_admins (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

4. Open `/admin`. You'll see every workspace, with health and usage.

## 5. Before clients sign up

- [ ] Fill in `LEGAL` in `src/lib/brand.ts` (company name, address, email, grievance officer, city). Until then `/privacy` and `/terms` show placeholders.
- [ ] Rotate every key that was ever pasted into a chat (Supabase secret key, Meta app secret, Meta and WhatsApp tokens).

## 6. Each client: sign up and connect Meta

1. The client signs up and creates their workspace.
2. They follow **Help → Connect Meta ads** (`/help/connect-meta`, about 10 minutes):
   - create a system user in their business portfolio;
   - generate a token with no expiry;
   - paste it into **Settings → Meta**;
   - tick their ad accounts and Pages.
3. Insights and leads start arriving within the hour.
4. In `/admin`, extend their trial or set their plan, so the workspace doesn't pause after 14 days.

## 7. Each client: instant leads and WhatsApp replies

A client's token belongs to **their** Meta app. Meta sends that app's webhooks (new leads, WhatsApp replies) signed with that app's secret. LeadOS accepts several app secrets, separated by commas, so you register each client's app once:

1. In the client's Meta app (developers.facebook.com → their app):
   - **Webhooks → Page:**
     - callback URL `https://<your address>/api/webhooks/meta`;
     - verify token = your `META_WEBHOOK_VERIFY_TOKEN`;
     - subscribe to `leadgen`.
   - **WhatsApp → Configuration:** the same callback URL and verify token; subscribe to `messages`.
2. Copy the client's **App secret** (their app → Settings → Basic).
3. Vercel → Settings → Environment Variables → `META_APP_SECRET`:
   - add a comma and the client's secret, e.g. `yoursecret,clientAsecret`;
   - then **Redeploy**.
4. WhatsApp:
   - the client follows **Help → Connect WhatsApp**;
   - they create the three templates (**Help → WhatsApp message templates**) and wait for Meta's approval;
   - then they turn the bot on in **Settings → WhatsApp**.
5. Check: Settings → WhatsApp says **"Receiving replies"**, and a test lead from Meta's Lead Ads Testing Tool shows up within a minute.

This manual step goes away once LeadOS has Meta App Review and "Continue with Facebook" (`LAUNCH-CHECKLIST.md`, section 1).

## 8. After launch

- Look at `/admin/health` once a day: failed syncs, stuck webhooks, connections needing reconnection.
- When a client says leads are late, first check that their app's webhooks point at your address and that their secret is in `META_APP_SECRET`.
