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
| Overview: KPIs + spend trend from pre-aggregated rollups (one RPC call) | ✅ (empty until Meta sync exists) |
| Audit log (append-only) | ✅ |
| Platform admin console (org list, no lead PII) | ✅ |
| System / Light / Dark appearance, mobile layout | ✅ |
| Meta OAuth + ads/leads sync, webhook inbox, job queue | ⏳ next phase |
| WhatsApp bot per tenant | ⏳ |
| Billing (Razorpay) | ⏳ |

## Setup

1. Create a **new** Supabase project at supabase.com. Don't use the live firm's project.
2. In **SQL Editor**, paste and run [`supabase/migrations/0001_tenancy.sql`](supabase/migrations/0001_tenancy.sql).
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
| Invite says "different email" | The invited person must sign in with exactly the address the invite was sent to. |

## Known gaps (before launch)

- No automated RLS isolation test suite yet (pgTAP + HTTP). This is the next item.
- Script CSP isn't set yet (other security headers are, in `next.config.ts`).
- No MFA enforcement for owners and admins yet.
- `ad_daily` uses only a default partition. Monthly partitions get created by the sync job once it exists.
