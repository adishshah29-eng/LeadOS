# LeadOS (working name)

Multi-tenant SaaS for real-estate teams and agencies: Meta ads reporting, a leads
pipeline, and a WhatsApp bot that welcomes and qualifies every new lead. It replaces the single-firm `meta-crm`
app. The full plan is in [`docs/PLATFORM_PLAN.md`](docs/PLATFORM_PLAN.md).

Stack: Next.js 16 (App Router, Server Components/Actions), Supabase (Postgres + Auth + RLS + Vault), Inngest (background jobs), Tailwind 4.

## What works today

| Area | Status |
|---|---|
| Sign up, sign in, sign out, email confirmation | ✅ |
| Workspaces (organizations), switcher, 14-day trial banner | ✅ |
| Roles: owner, admin, manager, agent, viewer, enforced by Postgres RLS | ✅ |
| Invite links (hashed, single use, 7-day expiry, bound to email) | ✅ |
| Team page: change role, remove member, revoke invite | ✅ |
| Projects | ✅ |
| Leads: add, filter, search, keyset pagination, status, assignment, timeline events | ✅ |
| Overview: 7/30/90-day range, project filter, campaign + ad tables with Wasting/Best flags | ✅ (tables need migration 0003) |
| Lead detail: call / WhatsApp / email, form answers, timeline with notes | ✅ |
| Project access for managers and viewers | ✅ |
| Leads CSV export (admins, logged, formula-injection safe) | ✅ |
| Account page: name, password, two-factor login (authenticator app) | ✅ |
| Client report links: read-only dashboard, no login, expiring, revocable | ✅ (needs migration 0004) |
| Platform admin: suspend / reactivate workspaces (two-factor required) | ✅ (needs migration 0004) |
| Audit log (append-only) | ✅ |
| Landing page | ✅ |
| System / Light / Dark appearance, mobile layout, nonce-based CSP | ✅ |
| Meta connect (System User token in Vault), ad account + Page picker | ✅ |
| Ads + leads sync jobs (Inngest), instant lead webhook with inbox + sweeper | ✅ |
| Facebook Login (OAuth) connect | ⏳ after Meta App Review |
| WhatsApp bot per workspace: welcome template, button questions, scoring, AI answers from your facts, follow-ups | ✅ (needs migration 0005 + a number) |
| WhatsApp inbox in two sections, "We messaged" and "Messaged us", with pause-the-bot and manual replies | ✅ |
| Trial expiry: workspace pauses (leads keep arriving, CSV export still works); admin can extend or set a plan | ✅ (needs migration 0006) |
| Forgot password / reset by email | ✅ (Supabase's built-in email until Resend is set up) |
| Onboarding: setup guide for new workspaces, first-visit product tour, help center with step-by-step guides, landing FAQ | ✅ (guides live in `src/lib/guides.ts`) |
| Privacy policy, terms, data-deletion pages | ✅ (fill in `LEGAL` in `src/lib/brand.ts`) |
| Billing (Stripe) | ⏳ needs a Stripe account (India is invite-only: register the company first) |
| Daily / weekly email reports | ⏳ needs a Resend account |

## Setup

1. Create a **new** Supabase project at supabase.com. Don't use the live firm's project.
2. In **SQL Editor**, run every file in [`supabase/migrations/`](supabase/migrations) in order (0001, 0002, ...).
   Then run [`supabase/tests/rls_isolation.sql`](supabase/tests/rls_isolation.sql). It should end with
   `ALL ... RLS ISOLATION CHECKS PASSED` (that "error" is how it rolls its test data back).
3. Copy the env template and fill in **Project Settings → API → Project URL** and the **publishable (anon) key**:
   ```bash
   cp .env.example .env.local
   ```
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. Open http://localhost:3000, create an account, then create a workspace.

For local development you can turn off **Authentication → Providers → Email → Confirm email**
in Supabase, so sign-up logs you straight in.

### Meta integration (ads + leads sync)

1. Run [`supabase/migrations/0002_meta_integration.sql`](supabase/migrations/0002_meta_integration.sql) in the SQL Editor.
2. In `.env.local`, fill in the two server-only secrets (see `.env.example`):
   `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API keys) and `META_APP_SECRET` (Meta app → Settings → Basic).
3. Start the job runner next to `npm run dev`:
   ```bash
   npm run inngest:dev
   ```
   Its dashboard (http://localhost:8288) shows every sync run, retry and failure.
4. In the app: **Settings → Meta → Connect**, paste a System User token, pick ad accounts and Pages, **Save and sync**.
5. Instant leads need a public URL. Point the Meta app's webhook (Page → `leadgen`) at
   `https://<your-domain>/api/webhooks/meta` with `META_WEBHOOK_VERIFY_TOKEN` as the verify token.
   Locally, leads still arrive through the scheduled sync.

A pasted token belongs to whichever Meta app it was generated for. For your own business that's our app,
so webhooks reach us. A client's token comes from *their* app, so their instant leads and WhatsApp replies
go there instead; their leads still arrive through the hourly sync. "Continue with Facebook" (Facebook
Login for Business, after Meta App Review) fixes this.

How syncing works:

| Job | When | What |
|---|---|---|
| `meta-schedule-syncs` | hourly (IST :05), deep at 02:40 and 14:40 | Fans out one ads sync per enabled account (2 days, or 7 on deep runs) and one leads sync per workspace |
| `meta-ads-sync` | per event | One run per ad account at a time; app-wide throttle. Upserts only changed rows, then rebuilds that project's rollups |
| `meta-leads-sync` | per event | Pulls leads for ads that delivered in the last 14 days; existing leads keep their status |
| `meta-lead-received` | per webhook | Separate lane so instant leads never wait behind syncs |
| `meta-sweep-webhooks` | every 5 min | Re-queues webhook events that were stored but not processed |
| `meta-rollups-rebuild` | per event | Rebuilds a workspace's project totals after an ad account is linked, moved or unlinked |
| `wa-*` | per event / hourly | Welcome, inbound messages (one at a time per phone), manual replies, follow-ups 10:15–19:15 IST, account linking |

When Meta rejects a token, the workspace is marked **Reconnect needed** and its jobs stop retrying.
When Meta's usage headers pass 75%, the job backs off until Meta says the quota is back.

### WhatsApp bot

1. Run [`supabase/migrations/0005_whatsapp_bot.sql`](supabase/migrations/0005_whatsapp_bot.sql).
2. **Settings → WhatsApp**: paste the Phone number ID and a System User token, then set up the questions,
   templates and facts, and switch the bot on. It only ever messages leads that arrive after that, within 24h.
   Connecting also finds the customer's WhatsApp Business Account and subscribes our app to it
   (`subscribed_apps`), so their replies reach the app the token belongs to (see the note under Meta). If the token can't
   see the account, the page says so and offers **Check again**.
3. In WhatsApp Manager, create the three templates (welcome, nudge, follow-up) with `{{1}}` = first name and
   `{{2}}` = project; give the welcome quick-reply buttons like "Yes, let's start", "Call me", "Not interested".
4. **Platform setup, once (you, not each customer):** in *our* Meta app → WhatsApp → Configuration, set the
   callback URL to `https://<your-domain>/api/webhooks/meta` with `META_WEBHOOK_VERIFY_TOKEN`, and subscribe the
   `messages` field.
5. Optional: `GEMINI_API_KEY` lets the bot understand typed messages and answer questions from your facts.

`WA_DRY_RUN=1` (development only) logs messages instead of sending them. The bot's decisions live in
`src/server/bot/brain.ts` (pure, unit-tested); sending and saving in `runner.ts`.

### Trial and plans

Run [`supabase/migrations/0006_billing_guard.sql`](supabase/migrations/0006_billing_guard.sql). It also stops
workspace admins from changing their own plan, trial date or suspension through the API (only `name` stays
editable). When a trial ends, every page of the workspace goes to `/o/<slug>/trial-ended`. Lead capture, syncs
and the CSV export keep working, and the bot finishes conversations already in progress but starts no new
ones. Until Stripe is wired in, set a paid plan or extend a trial in `/admin`.

### Make yourself platform admin

Run once in the SQL Editor, using the email you signed up with:

```sql
insert into public.platform_admins (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

A "Platform admin" link then appears in the sidebar (`/admin`).

## Production

A production build (`next build`) fails, and a production server refuses to start, if a required setting is
missing or a dev-only switch is on; the error names the setting, never its value. So `next build` on a dev
machine with `.env.local` fails on purpose: build for production on the host. Set these in the host's environment:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production Supabase project |
| `SUPABASE_SECRET_KEY` | Required. Server only |
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Required |
| `NEXT_PUBLIC_SITE_URL` | Required: only the domain, e.g. `https://leados.in` (links, sitemap). Set before the build |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Required. From Inngest Cloud |
| `GEMINI_API_KEY` | Optional |
| `WA_DRY_RUN`, `INNGEST_DEV` | Must **not** be set (any value other than `0`/`false` blocks the build) |

- `GET /api/health` returns `200 {"ok":true}` when the database answers and `503 {"ok":false}` otherwise. Point an
  uptime monitor at it.
- `/robots.txt` and `/sitemap.xml` are generated from `src/lib/seo.ts`.
- **CI:** `.github/workflows/ci.yml` runs type-check, lint and unit tests on every push. To block merging while it
  is red: GitHub → Settings → Branches → add a rule for `main` → *Require status checks to pass* → pick `check`.

## Security model

- **Row-Level Security is the boundary.** The web app only ever uses the publishable key plus the signed-in user's session. It never holds the service-role key. Every table has `org_id` and RLS.
- **One role-aware policy per table and command.** Postgres ORs permissive policies together, so adding a second permissive policy can widen access. Read the header of the migration before adding policies.
- **The org comes from the URL slug plus a membership check** (`requireOrg`), never from an id sent by the browser.
- Writes that touch more than one row or need extra checks go through `SECURITY DEFINER` RPCs with a pinned `search_path`: `create_organization`, `create_invitation`, `accept_invitation`, `set_member_role`, `remove_member`, `write_audit`.
- Agents can only change the status of leads assigned to them (enforced by a trigger). `org_id` can never change after insert.
- Invite tokens are stored as SHA-256 hashes. The raw link is shown once.
- `webhook_events` and `sync_runs` writes are worker-only (no RLS policy).
- The service-role client (`src/server/supabase-admin.ts`) is importable only from `src/server/**` and `src/app/api/**`. ESLint fails the build otherwise.
- Meta and WhatsApp tokens are stored with `connect_meta()` / `connect_whatsapp()` into Supabase Vault. Only `worker_meta_token()` / `worker_wa_token()` (service role) can decrypt them, and job steps never return a token, so it is never persisted in Inngest.

## Project layout

```
src/app/(auth)/        login, signup, forgot/reset password, server actions
src/app/o/[slug]/      workspace: overview, setup, leads, conversations, projects, team, settings + actions.ts
src/app/admin/         platform console
src/app/help/          public help center (content in src/lib/guides.ts)
src/app/(legal)/       privacy, terms, data deletion (details in LEGAL, src/lib/brand.ts)
src/app/api/           Meta/WhatsApp webhook, Inngest endpoint
src/server/jobs/       background jobs (Meta sync, WhatsApp)
src/server/bot/        WhatsApp bot: brain (pure), runner, Cloud API client, AI guard
src/server/meta/       Meta Graph API client
src/lib/auth.ts        requireUser, requireOrg, atLeast (UI-only checks)
src/lib/supabase/      server client + session-refresh proxy
src/components/        UI primitives (tokens in globals.css)
supabase/migrations/   SQL, run in order
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Every page redirects to `/setup` | `.env.local` is missing or the key is malformed. Restart `npm run dev` after editing. |
| Sign-up says "check your inbox" but no email arrives | Supabase's built-in mailer is rate-limited. Turn off email confirmation for development, or set up SMTP. |
| Creating a workspace fails | Check that the migration ran. `create_organization` must exist. |
| "Saved, but the background worker isn't reachable" | Start `npm run inngest:dev`. |
| A page under `/o/...` shows 404 in dev after adding routes | Stop the dev server, delete `.next/dev`, start it again. |
| Times look hours off | Check your computer's clock is set automatically. |
| Invite says "different email" | The invited person must sign in with exactly the address the invite was sent to. |

## Tests

```bash
npm test            # unit tests (also run by CI)
npm run typecheck   # generates route types, then tsc
npm run test:int    # integration tests against the running app: start `npm run dev` first
```

Unit tests (Node's built-in runner) cover the WhatsApp bot's decisions, the AI reply guard, phone number
formatting, the waste/best flags and CSV encoding.
Tenant isolation is tested in the database by `supabase/tests/rls_isolation.sql`.

## Known gaps (before launch)

- The RLS isolation test runs by hand in the SQL editor; it isn't wired into CI yet.
- Two-factor login is optional for owners and admins (required for the platform admin console).
- `ad_daily` uses only its default partition; nothing creates monthly partitions yet. Fine at current volume.
- Not deployed yet: needs Vercel (or similar), a domain, Inngest Cloud keys, and the Meta webhook pointed at it.
- Clients' instant leads and WhatsApp replies need Facebook Login for Business (Meta App Review, Tech Provider).
- No billing (Stripe) or real email sender (Resend) yet; invites are shared as links.
- `LEGAL` in `src/lib/brand.ts` holds placeholders; fill in the company details and have a lawyer review the pages.
