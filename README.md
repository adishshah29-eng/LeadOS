# LeadOS (working name)

Multi-tenant SaaS for real-estate teams and agencies: Meta ads reporting, a leads
pipeline, and (next) WhatsApp follow-up. It replaces the single-firm `meta-crm`
app. The full plan is in [`docs/PLATFORM_PLAN.md`](docs/PLATFORM_PLAN.md).

Stack: Next.js 16 (App Router, Server Components/Actions), Supabase (Postgres + Auth + RLS), Tailwind 4.

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
| WhatsApp bot per workspace: welcome template, button questions, scoring, AI answers from your facts, follow-ups, inbox with manual replies | ✅ (needs migration 0005 + a number) |
| Billing (Razorpay) | ⏳ needs a Razorpay account |
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

How syncing works:

| Job | When | What |
|---|---|---|
| `meta-schedule-syncs` | hourly (IST :05), deep at 02:40 and 14:40 | Fans out one ads sync per enabled account (2 days, or 7 on deep runs) and one leads sync per workspace |
| `meta-ads-sync` | per event | One run per ad account at a time; app-wide throttle. Upserts only changed rows, then rebuilds that project's rollups |
| `meta-leads-sync` | per event | Pulls leads for ads that delivered in the last 14 days; existing leads keep their status |
| `meta-lead-received` | per webhook | Separate lane so instant leads never wait behind syncs |
| `meta-sweep-webhooks` | every 5 min | Re-queues webhook events that were stored but not processed |

When Meta rejects a token, the workspace is marked **Reconnect needed** and its jobs stop retrying.
When Meta's usage headers pass 75%, the job backs off until Meta says the quota is back.

### WhatsApp bot

1. Run [`supabase/migrations/0005_whatsapp_bot.sql`](supabase/migrations/0005_whatsapp_bot.sql).
2. **Settings → WhatsApp**: paste the Phone number ID and a System User token, then set up the questions,
   templates and facts, and switch the bot on. It only ever messages leads that arrive after that, within 24h.
3. In WhatsApp Manager, create the three templates (welcome, nudge, follow-up) with `{{1}}` = first name and
   `{{2}}` = project; give the welcome quick-reply buttons like "Yes, let's start", "Call me", "Not interested".
4. Point the Meta app's WhatsApp webhook at `/api/webhooks/meta` (field `messages`).
5. Optional: `GEMINI_API_KEY` lets the bot understand typed messages and answer questions from your facts.

`WA_DRY_RUN=1` (development only) logs messages instead of sending them. The bot's decisions live in
`src/server/bot/brain.ts` (pure, unit-tested); sending and saving in `runner.ts`.

### Make yourself platform admin

Run once in the SQL Editor, using the email you signed up with:

```sql
insert into public.platform_admins (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

A "Platform admin" link then appears in the sidebar (`/admin`).

## Security model

- **Row-Level Security is the boundary.** The web app only ever uses the publishable key plus the signed-in user's session. It never holds the service-role key. Every table has `org_id` and RLS.
- **One role-aware policy per table and command.** Postgres ORs permissive policies together, so adding a second permissive policy can widen access. Read the header of the migration before adding policies.
- **The org comes from the URL slug plus a membership check** (`requireOrg`), never from an id sent by the browser.
- Writes that touch more than one row or need extra checks go through `SECURITY DEFINER` RPCs with a pinned `search_path`: `create_organization`, `create_invitation`, `accept_invitation`, `set_member_role`, `remove_member`, `write_audit`.
- Agents can only change the status of leads assigned to them (enforced by a trigger). `org_id` can never change after insert.
- Invite tokens are stored as SHA-256 hashes. The raw link is shown once.
- `webhook_events` and `sync_runs` writes are worker-only (no RLS policy).
- The service-role client (`src/server/supabase-admin.ts`) is importable only from `src/server/**` and `src/app/api/**`. ESLint fails the build otherwise.
- Meta tokens are stored with `connect_meta()` into Supabase Vault. Only `worker_meta_token()` (service role) can decrypt them, and job steps never return a token, so it is never persisted in Inngest.

## Project layout

```
src/app/(auth)/        login, signup, server actions
src/app/o/[slug]/      workspace: overview, leads, projects, team, settings + actions.ts
src/app/admin/         platform console
src/app/invite/        accept invitation
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
npm test
```

Unit tests (Node's built-in runner) cover the waste/best flags and CSV encoding.
Tenant isolation is tested in the database by `supabase/tests/rls_isolation.sql`.

## Known gaps (before launch)

- The RLS isolation test runs by hand in the SQL editor; it isn't wired into CI yet.
- Two-factor login is optional for owners and admins (required for the platform admin console).
- `ad_daily` uses only a default partition. Monthly partitions get created by the sync job once it exists.
