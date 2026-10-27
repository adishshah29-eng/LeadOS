# LeadOS launch checklist — what only you can do

The code side is being built feature by feature. This is everything else: accounts, legal and business steps. Do them in this order. The first three take the longest, so start them now.

Last updated: 2026-10-24

## 1. Start now (slow, weeks)

- [ ] **Register the company.** A Private Limited company or LLP. Talk to a CA (chartered accountant) about doing India first and a US company later through Stripe Atlas. Everything below needs it.
- [ ] **Meta Business Verification** for your business portfolio (business.facebook.com → Settings → Security centre).
- [ ] **Meta App Review** for the LeadOS app. Request:
  - `ads_read`
  - `leads_retrieval`
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `business_management`
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`

  It needs the privacy, terms and data-deletion URLs to be live, so it comes after step 2.
- [ ] **Become a WhatsApp Tech Provider** (Meta for Developers → WhatsApp → Tech Provider). This unlocks "Continue with Facebook" and WhatsApp Embedded Signup for clients.
- [ ] **Request a Stripe India invite** once the company exists (support.stripe.com → "Stripe accounts are invite-only in India"). Expect a video KYC call.

## 2. Go online (a day)

- [ ] **Buy a domain** (e.g. leados.in or the final brand name).
- [ ] **Vercel account**: import the GitHub repo, then add the production environment variables listed in the README.
- [ ] **Inngest Cloud account**: connect it to the Vercel app and copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Vercel.
- [ ] **Separate production Supabase project.** Don't reuse the dev one. Run every file in `supabase/migrations/` in order, then `supabase/tests/rls_isolation.sql`.
- [ ] **Supabase settings for production:**
  - turn email confirmation **on**;
  - set the site URL and redirect URLs to the domain;
  - turn on Point-in-Time Recovery (paid plan) for backups.
- [ ] **Meta app → Webhooks:**
  - callback `https://<domain>/api/webhooks/meta` with your verify token;
  - subscribe Page → `leadgen` and WhatsApp → `messages`.
- [ ] **Do not set** `WA_DRY_RUN` or `INNGEST_DEV` in production.
- [ ] **Supabase → Authentication → Rate Limits:** tighten sign-in, sign-up and verification limits per address. LeadOS's own limits protect its forms, but anyone can call Supabase's sign-in directly with the public key.
- [ ] **CAPTCHA:** create a free Cloudflare Turnstile site key, turn on CAPTCHA in Supabase → Authentication → Bot and Abuse Protection, then ask me to add the widget to the sign-in, sign-up and reset forms.
- [ ] **Set every production variable *before* the first build** (the README lists them). A production build now fails, naming what's missing, rather than deploying a broken app.
- [ ] **GitHub → Settings → Branches → rule for `main`:** require the `check` status, so red code can't merge.

## 3. Email (an hour)

- [ ] **Resend account.** Verify your domain (it adds DNS records).
- [ ] **Supabase → Authentication → SMTP:** use Resend, so password-reset and sign-up emails actually arrive. The built-in sender only sends a few an hour.

## 4. Legal and safety

- [ ] **Fill in `LEGAL`** in `src/lib/brand.ts`: company name, address, contact email, grievance officer, city.
- [ ] **Lawyer review** of `/privacy`, `/terms` and `/data-deletion`.
- [ ] **Lawyer review of one blog comparison** (HubSpot or Zoho) before setting `draft: false` on the named-competitor comparisons in `src/content/blog/`.
- [ ] **Rotate every key pasted into chats so far:** Supabase secret key, Meta app secret, Meta and WhatsApp tokens.
- [ ] **Run SQL to remove the two orphaned Vault secrets** in the dev database:
  `delete from vault.secrets where id in ('cd176aaa-b468-42a3-824d-f6b34508e21e','7a9bb5d9-73db-4c2b-ab8d-06baa41ae42a');`
- [ ] **Run migration `0006_billing_guard.sql`** in the dev database if you haven't. Until then, workspace admins can change their own plan.
- [ ] **Production database:** run every migration in order, through `0014_admin_tools_hardening.sql` (all done in dev).
- [ ] **Make yourself platform admin in production** (README, "Platform admin"): sign up, turn on two-factor in Account, then add your user as `super_admin` in `platform_admins`. The admin console, health page and support view all need two-factor.

## 5. WhatsApp

- [ ] **Create and get approved** the templates `lead_welcome`, `lead_nudge` and `lead_followup` (texts are in `/help/whatsapp-templates`).
- [ ] **Give the System User full control** of your WhatsApp Business Account, then click "Check again" in Settings → WhatsApp.

## 6. Monitoring (optional, recommended)

- [ ] **Sentry account** (free tier) for error alerts. Tell me when you have it and I'll wire it in.
- [ ] **Uptime monitor** (e.g. UptimeRobot, free) pointed at `https://<domain>/api/health`.

## 7. After the accounts exist, ask me to build

- [ ] Stripe billing: checkout, plans, invoices, customer portal.
- [ ] Emails: invites, welcome, setup reminders, daily summary (Resend).
- [ ] "Continue with Facebook" and WhatsApp Embedded Signup (after App Review).
- [ ] Sentry wiring.

## Deferred from reviews (code, later)

- Pin GitHub Actions to exact commit SHAs, not version tags (supply-chain hardening).
- `/api/webhooks` and `/api/inngest` skip the sign-in proxy by prefix match, as `/api/health` did. Anchor them like `/api/health$`.
- On workspace deletion, also unsubscribe its Facebook Pages and WhatsApp account at Meta (best effort, before erasing the token). Needs real Meta tokens to test.
- After an account is deleted, other open browser tabs keep working (with failed loads) for up to an hour, until their sign-in token expires. Could send them to /login instead.
- Integration test D3 failed once in seven full runs and couldn't be reproduced; watch for it.
- Rate limits trust Vercel's x-forwarded-for. Off Vercel, a client sending a junk address header is treated as "unknown", and address-only limits (report links, sign-up) are skipped for it. Per-email limits still apply. Revisit if hosting moves off Vercel.
- Rate limits use fixed windows, so up to twice a limit can get through right at a window boundary (accepted trade-off).
