# Platform Plan: from one firm's CRM to a multi-tenant SaaS

Status: draft for review · 2026-10-18
Inputs: a read of the `meta-crm` repo (commit `fb256e3`), plus the installed skills
`senior-engineering-partner`, `system-design`, and `ui-ux-pro-max`.

---

## 0. One-paragraph summary

Keep the stack (Next.js + Supabase + Vercel). It is a good fit and the hard domain logic is
already written: Meta insights sync, lead sync, the guarded WhatsApp bot, scoring, and
follow-ups. What has to change is the **shape** of the app. Today it is a single-tenant app that
anyone with the URL can open, reads its config from environment variables, and adds up data in
JavaScript. It needs to become a **multi-tenant platform** with these properties:
1. every row belongs to an organization and Postgres Row-Level Security enforces it;
2. real login, roles, and a super-admin console;
3. each customer connects their own Meta and WhatsApp accounts through OAuth, with tokens encrypted;
4. sync runs in a per-tenant job queue instead of a handful of Vercel crons;
5. dashboards read from pre-aggregated SQL tables, so they load in under 300 ms;
6. billing, audit logs, monitoring, and backups are in place before the first paying customer.

---

## 1. What exists today (audit, with evidence)

### What is already good
- **Meta accuracy work is real.** `src/lib/meta.ts` re-pulls trailing days, includes deleted and archived ads, and has a reconcile endpoint. That is hard-won knowledge, so port it as-is.
- **Webhook signatures are verified correctly.** `src/lib/bot/webhook.ts:17` uses HMAC-SHA256 with `timingSafeEqual` and supports rotating secrets.
- **The LLM guardrails are thoughtful.** `src/lib/bot/guard.ts` has a layered defence: buttons are handled before any AI call, injection pre-screening, number-must-exist-in-facts output checks, and a daily cap.
- **Idempotency on inbound WhatsApp messages.** `wa_messages.wa_message_id UNIQUE` means a duplicate delivery is not processed twice.

### Security gaps (severity order)
| # | Finding | Evidence | Impact |
|---|---|---|---|
| S1 | **No authentication at all** | `README.md` "Auth: none… every `/api/*` route is open"; commit `20f4a36` removed it | Anyone with the URL gets every lead's name, phone, and email. This is a DPDP Act breach waiting to happen. |
| S2 | **Cron routes fail open** | `src/lib/bot/adminAuth.ts:27`: `if (!secret) return null` | If `CRON_SECRET` is unset, anyone can trigger syncs, sends, and Meta API spend. |
| S3 | **Service-role key on every query, no RLS** | `src/lib/supabase.ts` is a single service client | Once multi-tenant, one missed `.eq("org_id")` leaks one customer's data to another. |
| S4 | **Admin key stored in `localStorage`** | `src/lib/bot/adminKeyClient.ts:5` | Any XSS can steal the master key, and it is shared by everyone who uses it. |
| S5 | **All secrets are global env vars** | `META_ACCESS_TOKEN`, `META_AD_ACCOUNTS`, `WHATSAPP_ACCESS_TOKEN` | One leaked token exposes every account, and you can't onboard a customer without a redeploy. |
| S6 | Webhook verify-token uses plain `===` | `src/app/api/webhooks/meta/route.ts:20` | Minor, but it should be constant-time. |
| S7 | Google Sheet used as a data store | `src/lib/bot/sheets.ts` | PII sits outside your access controls. Keep it only as an optional per-tenant export. |
| S8 | `data.db` is committed (empty) | `git ls-files` | Junk file. Remove it and add it to `.gitignore`. |

### Why data fetching is slow
| # | Cause | Evidence | Fix |
|---|---|---|---|
| P1 | `select *` of raw ad-day rows, paged 1,000 at a time, **one page after another** | `src/app/api/ads/summary/route.ts` + `src/lib/supabasePaged.ts` | A 90-day, 5-account view means dozens of round-trips. Aggregate in SQL instead (§5). |
| P2 | Totals and portfolio breakdown computed in JS on every request | `summary/route.ts` builds a `pMap` loop | Use rollup tables or materialized views keyed by `(org_id, date, level)`. |
| P3 | The dashboard is one 1,256-line client component that fetches in `useEffect` | `src/app/dashboard/page.tsx` | Nothing renders until JS loads, then the waterfall runs. Use Server Components, streaming, and TanStack Query. |
| P4 | Meta API calls on the request path (the Refresh button) | `fetch-today` POST from the UI | Move them to a background job; the UI only shows "syncing…" and live progress. |
| P5 | Indexes don't lead with the tenant key | `schema.sql` indexes on `snapshot_date`, `ad_id` | All new indexes start with `org_id`. |

### Design and UX gaps
- `PRODUCT.md` is a strong brief (Linear/Vercel restraint, mobile-first, don't rely on colour alone). The code doesn't yet have a token system, a three-state System/Light/Dark control, or a component library. Pages are hand-rolled.
- There's no onboarding, empty states, settings, or team pages, because none were needed for one firm.

---

## 2. Product scope

### Who it's for (v1 ICP)
Indian real-estate developers, brokers, and small performance agencies that run Meta lead ads and
follow up on WhatsApp. Start with the niche you already know. The platform can generalize later.

### v1 functional requirements
1. **Sign up and onboard:** create an org → connect Meta (OAuth) → pick ad accounts → map accounts to projects → (optional) connect WhatsApp → invite team.
2. **Ads dashboard:** spend, results, and CPL by project, campaign, and ad, with wasted-spend flags and a date range. Reconcile against Ads Manager.
3. **Leads inbox:** instant capture through the webhook, de-duplication, status pipeline (New → Contacted → Site visit → Negotiation → Won/Lost), assignment to agents, notes, and an activity timeline.
4. **WhatsApp bot (per org):** knowledge base, qualifying flow, Hot/Warm/Cold scoring, follow-ups, and human takeover.
5. **Reports:** daily email, weekly WhatsApp/PDF report, and a shareable read-only client link (signed and expiring).
6. **Team and roles** (see §3), plus audit log.
7. **Billing:** plans, trial, and usage limits.
8. **Super-admin console** for you (see §3).

### Non-functional targets
| Target | Number |
|---|---|
| Dashboard p95 load (cached rollups) | < 300 ms API, < 1.5 s LCP on 4G |
| Lead webhook → WhatsApp welcome | p95 < 10 s |
| Availability (app) | 99.5% at launch, 99.9% later |
| Tenant isolation | zero cross-tenant reads, proven by automated tests |
| RPO / RTO | ≤ 5 min (Supabase PITR) / ≤ 4 h |

### Scale estimate (back-of-the-envelope)
Year 1 assumption: 200 orgs × 5 ad accounts × 300 active ads ≈ 300k ad-day rows per day re-pulled
over a trailing 7 days, which is about **2M upserts per day**. That's fine for one Postgres if batched.
Leads: 200 orgs × 50 per day = 10k per day. WhatsApp: about 100k messages per day.
**Conclusion:** one Supabase Pro/Team project handles year 1 comfortably. Don't build microservices.
The real bottleneck is **Meta API rate limits per ad account**, so the job queue needs per-account
concurrency control.

### Out of scope for v1
Google Ads and other channels, a native mobile app (ship a responsive PWA instead), custom report
builder, white-label custom domains, and AI calling.

---

## 3. Roles and permissions

Two layers: **platform** (you) and **organization** (your customer).

| Role | Scope | Can |
|---|---|---|
| **Super Admin** | Platform | See all orgs, usage, health, and billing; feature flags; suspend an org; **impersonate with a reason**, time-limited, written to the audit log, with a banner shown to the user. Requires MFA. |
| **Support** | Platform | Read-only view of org metadata and job health. No lead PII unless an org grants access. |
| **Owner** | Org | Everything, including billing, deleting the org, and transferring ownership. Exactly one per org. |
| **Admin** | Org | Integrations, team, bot config, all projects. |
| **Manager** | Org (assigned projects) | Dashboards and leads for their projects, assigning leads, reports. |
| **Agent** | Org (assigned leads) | Only the leads assigned to them: chat, notes, status. Phone numbers can be masked if the org wants. |
| **Client Viewer** | One project | Read-only dashboard and reports. This is the agency's end client. |

Permissions are checked in **two places**: RLS policies in Postgres (the real boundary) and a
`can(user, action, resource)` helper in the UI (for hiding buttons only).

---

## 4. Architecture

```
            ┌──────────── Vercel (Next.js App Router) ────────────┐
Browser ──▶ │ Server Components · Route Handlers · Server Actions │
            │  - Supabase Auth session (httpOnly cookie)          │
            │  - user-scoped Supabase client  → RLS applies       │
            └───────┬───────────────────────────────┬─────────────┘
                    │                               │ enqueue
Meta webhooks ──▶ /api/webhooks/meta (verify, map page/phone → org, insert, ACK fast)
                    │                               ▼
                    │                 ┌──── Job runner (Inngest or Trigger.dev) ───┐
                    │                 │ ads.sync(org, account)  · leads.sync       │
                    │                 │ bot.process(message)    · followups.tick   │
                    │                 │ reports.daily/weekly    · rollups.refresh  │
                    │                 │ per-account concurrency=1, retries+backoff │
                    │                 └──────────────┬─────────────────────────────┘
                    ▼                                ▼ (service role, ONLY in workers)
            ┌───────────────────── Supabase ───────────────────────┐
            │ Postgres + RLS · Auth · Vault (encrypted tokens)     │
            │ Storage (report PDFs) · PITR backups · Realtime      │
            └──────────────────────────────────────────────────────┘
External: Meta Graph / WhatsApp Cloud API · Gemini/Claude · Resend · Razorpay/Stripe · Sentry
```

### Key decisions (solves / worsens / when to change)
| Decision | Solves | Worsens | Change when |
|---|---|---|---|
| **Modular monolith** (one Next.js app, domain folders) | Fast for a solo or small team; one deploy | Needs import-boundary discipline | Team > 8 or one domain needs its own scaling |
| **Shared DB, `org_id` on every row + RLS** | Cheap; one migration path; isolation enforced by Postgres | One noisy tenant can affect others | An enterprise customer demands a dedicated DB |
| **Managed job queue** (Inngest/Trigger.dev) over Vercel cron | Per-tenant fan-out, retries, rate-limit control, visibility | New vendor dependency | Volume makes self-hosting cheaper (pg-boss/pgmq) |
| **Rollup tables** refreshed after each sync | Dashboards read hundreds of rows, not millions | Staleness of a few minutes; extra write cost | Need real-time intraday numbers |
| **Supabase Vault / pgsodium** for Meta and WhatsApp tokens | Encrypted at rest; never readable by the user role | Key management needs care | Move to cloud KMS at SOC 2 time |
| **Meta Tech Provider + WhatsApp Embedded Signup** | Customers connect in 2 clicks; their number, their billing | Meta App Review and Business Verification take weeks | n/a: required for SaaS |

### Folder structure (new)
```
src/
  app/(marketing)/        landing, pricing, legal
  app/(auth)/             login, signup, invite, MFA
  app/(app)/[org]/        dashboard, leads, conversations, reports, settings
  app/(admin)/            super-admin console (separate layout, MFA gate)
  app/api/webhooks/       meta, whatsapp, billing
  modules/                ads/  leads/  bot/  reports/  billing/  orgs/  audit/
     each: schema.ts (zod) · queries.ts · actions.ts · service.ts · *.test.ts
  lib/db/                 supabase server/browser/admin clients (admin = workers only)
  lib/auth/               session, can(), requireRole()
  jobs/                   queue functions
supabase/migrations/      versioned SQL (CLI), never edited by hand in the dashboard
```

---

## 5. Data model (core tables)

All tenant tables have `org_id uuid not null`, RLS enabled, and indexes that **start with `org_id`**.

```
organizations(id, name, slug, plan, status, created_at)
memberships(org_id, user_id, role, invited_by, created_at)          PK(org_id,user_id)
project_members(project_id, user_id)                                 manager scoping
projects(id, org_id, name, ...)
integrations(id, org_id, kind[meta|whatsapp|sheets], status, external_id, vault_secret_id, scopes, expires_at)
ad_accounts(id, org_id, project_id, meta_account_id, name, result_action_types)
ad_daily(org_id, ad_account_id, date, ad_id, campaign_id, adset_id, spend, impressions, clicks, results, ...)
                                                                     PK(org_id, ad_account_id, date, ad_id)
ad_rollup_daily(org_id, project_id, level[account|campaign|adset|ad], entity_id, date, spend, results, ...)
leads(id, org_id, project_id, meta_lead_id UNIQUE per org, name, phone_e164, email, status, assigned_to, score, source, created_at)
lead_events(id, org_id, lead_id, actor_id, type, payload, created_at)   timeline, append-only
wa_conversations / wa_messages   (existing shape + org_id)
bot_knowledge(org_id, project_id, content, version)
reports(id, org_id, kind, period, storage_path, share_token_hash, expires_at)
subscriptions(org_id, provider, plan, status, current_period_end)  ·  usage_counters(org_id, metric, period, value)
audit_log(id, org_id, actor_id, impersonator_id, action, target, ip, at)   append-only
platform_admins(user_id, role)
```

**RLS pattern:** a `security definer` function `auth_org_ids()` returns the caller's org IDs from
`memberships`. Policies look like `using (org_id in (select auth_org_ids()))`, with extra
conditions for Agent (`assigned_to = auth.uid()`) and Client Viewer (one `project_id`).
**Tests:** pgTAP checks for each table (member can read, other org denied) plus an HTTP test
suite that logs in as Org A and tries Org B's IDs.

**Webhook tenant routing:** a Meta page ID maps to an org through `integrations.external_id`. A
WhatsApp `phone_number_id` maps to an org the same way. An unknown ID is logged and dropped.
The tenant is never taken from the request body.

---

## 6. Security plan (the floor, from day one)

1. **Auth:** Supabase Auth (email + password, magic link, Google), **mandatory MFA (TOTP) for Owner, Admin, and Super Admin**, session in httpOnly cookies via `@supabase/ssr`, invite-only org joins.
2. **Authorization:** RLS on every table. The service-role key is only importable from `jobs/` and webhook handlers, enforced by an ESLint `no-restricted-imports` rule.
3. **Secrets:** per-tenant tokens in Supabase Vault; platform secrets in Vercel env with separate dev, staging, and prod projects and keys. Delete the `localStorage` admin key and replace it with roles.
4. **Inputs:** zod schemas at every route and action boundary; types inferred from them.
5. **Webhooks:** HMAC verified (already done), constant-time token check, idempotency by external ID, ACK in < 2 s and process in the queue.
6. **Crons and jobs:** fail **closed**; the job runner signs its own requests.
7. **Headers:** strict CSP, HSTS, `frame-ancestors 'none'`, `nosniff`; rate limiting on auth and public endpoints (Upstash Ratelimit).
8. **Audit log** for logins, role changes, exports, impersonation, integration changes, and bulk deletes.
9. **PII:** mask phone numbers in logs, CSV export only for Admin and above (and audited), retention settings per org, DSAR export and delete per lead (India **DPDP Act 2023**).
10. **Supply chain and CI:** GitHub Actions running `tsc --strict`, ESLint, tests, `npm audit`, gitleaks, and semgrep as required checks; Dependabot on; branch protection on `main`.
11. **Backups:** Supabase PITR plus a weekly logical dump to a separate bucket, with **one restore test before launch** and quarterly after that.

---

## 7. Performance plan

1. **Aggregate in Postgres.** After each `ads.sync(account)` job, recompute `ad_rollup_daily` for the touched dates. Dashboards then query rollups with `sum()` over at most about 1,000 rows using an RPC (`get_dashboard(org, project, from, to)`) that returns totals, the trend, and the top and bottom lists in **one round-trip**.
2. **Server Components and streaming.** The page shell renders instantly; KPI cards, chart, and tables stream in `<Suspense>` with skeletons.
3. **TanStack Query** on the client for filters and date changes, with prefetch on hover and `keepPreviousData`.
4. **Cache keys always include `org_id`.** Use Next `unstable_cache` and `revalidateTag('org:{id}:ads')` fired at the end of a sync job. Tenant data is never cached at the CDN.
5. **Leads list:** cursor pagination, server-side filters, indexes on `(org_id, status, created_at desc)`, and a virtualized table.
6. **Realtime:** Supabase Realtime on `leads` and `wa_messages` filtered by org, so new leads pop in without polling.
7. **Budgets in CI:** Lighthouse CI with LCP < 2.5 s and JS < 200 KB per route.

---

## 8. Design system

The `ui-ux-pro-max` run suggested a teal "trust" palette, which is a good fit. It also suggested
Cinzel/Josefin fonts and "exaggerated minimalism", which suit a **marketing site** but would
contradict `PRODUCT.md` for a dense dashboard. Use them at most on the landing page.

- **Components:** shadcn/ui on Radix (accessible primitives, you own the code), Lucide icons, Recharts or Tremor for charts.
- **Type:** Inter or Geist Sans for the UI, Geist Mono / tabular numbers for figures. 14px base in dense tables, 16px in forms.
- **Colour tokens** (semantic, never raw hex in components): `--primary #0F766E` (teal), `--accent #0369A1`, neutrals in the slate scale, status colours (success, warning, danger) **always paired with an icon or label**. Full light and dark sets, with a **System / Light / Dark** control (System is the default, stored per device).
- **Density:** 8px spacing grid, 32–36px table rows, sticky headers, keyboard shortcuts (`/` search, `j/k` move through leads), command palette (⌘K).
- **Key screens to design first:** onboarding wizard, "Today" home (what needs attention), leads inbox with conversation side panel, project dashboard, settings → integrations, super-admin org list.
- **Every screen has:** a loading skeleton, an empty state with the next action, an error state with retry, and a mobile layout at 375px.
- **Gate:** WCAG 2.2 AA with axe in CI plus a manual keyboard pass.

---

## 9. Billing and business

- **Payments:** Razorpay for India (UPI and cards, GST invoices) first; Stripe later for international customers.
- **Pricing sketch** (validate with 5 customers): Starter ₹2,999/mo (2 ad accounts, 1 WhatsApp number, 3 seats), Growth ₹7,999/mo (10 accounts, bot, 10 seats), Agency ₹19,999/mo (unlimited projects, client portal). WhatsApp conversation fees are passed through by Meta to the customer's WABA.
- **Limits** are enforced in actions and jobs from `usage_counters`. At 80% of a limit the user gets a soft warning; at 100% writes are blocked but leads keep being captured. Never drop a lead.
- **Meta prerequisites (start now, they take the longest):** Business Verification, App Review for `ads_read`, `leads_retrieval`, `pages_manage_metadata`, `business_management`, `whatsapp_business_management`, and `whatsapp_business_messaging`; register as a WhatsApp **Tech Provider**; publish a privacy policy, terms, and a data-deletion URL.

---

## 10. Roadmap

| Phase | Weeks | Outcome | Done when |
|---|---|---|---|
| **0. Foundations** | 1–2 | New repo structure, Supabase CLI migrations, dev/staging/prod, CI gates, Sentry, design tokens + shadcn. **Submit Meta App Review / Business Verification.** | CI green; staging deploys from `main` |
| **1. Tenancy and auth** | 3–4 | Orgs, memberships, roles, invites, MFA, RLS on every table, pgTAP and HTTP isolation tests, audit log | Cross-tenant test suite passes; no route uses the service role |
| **2. Integrations** | 5–6 | Meta OAuth (Facebook Login for Business) → token in Vault → account picker; webhook tenant routing; job queue with `ads.sync` and `leads.sync` ported from `lib/meta.ts` and `lib/leadSync.ts` | A new org connects Meta and sees data with no env-var edits |
| **3. Fast dashboards** | 7–8 | Rollup tables, `get_dashboard` RPC, new dashboard UI (Server Components), leads inbox with pipeline, assignment, and Realtime | p95 API < 300 ms on 90 days × 10 accounts of seed data |
| **4. WhatsApp bot per tenant** | 9–10 | Embedded Signup, port `lib/bot/*` with `org_id`, per-org knowledge base, LLM cap, human takeover | The bot runs for 2 orgs on different numbers with no crosstalk |
| **5. Billing and admin** | 11–12 | Razorpay plans, trial, usage limits; super-admin console (orgs, usage, job health, impersonation) | Trial → paid flow works end to end in Razorpay test mode |
| **6. Pilot and harden** | 13–14 | Migrate Parmarr as tenant #1, add 3–5 pilot customers, restore drill, pen-test checklist (OWASP Top 10), uptime monitoring, status page, docs | Pilots live for 2 weeks with no SEV1 |

**Migration of the current firm:** create org #1, run a one-off script that stamps `org_id` on the
existing rows, move tokens from env into Vault, and repoint the Meta webhook. The old app stays
read-only for 2 weeks, then is retired.

---

## 11. Open questions for you

1. **Name and domain** of the startup (needed for the Meta app, privacy policy, and email sender).
2. **Solo or with a co-founder/dev?** This changes how much to buy (Inngest, Clerk) vs build.
3. **Agency-first or developer/broker-first?** It decides whether "Client Viewer" and multi-project are v1 or v2.
4. **Pricing market:** India only at launch? (That decides Razorpay vs Stripe first.)
5. **Is Google Sheets sync a must-keep feature** for customers, or only for Parmarr?

---

## 12. System-design review (2026-10-18) and what changed

The `system-design-orchestrator` agent reviewed this plan using the building-block skills.

**Already applied in `supabase/migrations/0001_tenancy.sql`:**
- RLS uses one role-aware policy per table and command. Separate permissive policies would OR together and let agents see every lead.
- `webhook_events` inbox: each webhook is stored with a unique `(kind, dedupe_key)` before the request is acknowledged.
- `sync_runs` table; `integrations UNIQUE (kind, external_id)`, so one page or number maps to exactly one org.
- `ad_daily`: primary key includes `ad_account_id`, raw `actions jsonb`, monthly range partitioning, `fillfactor = 85`.
- `ad_rollup_daily` has a real primary key, and its `level` stops at adset (ad-level rows come from `ad_daily`).
- Lead indexes match the cursor `(lead_created_at, id)`, plus `(org_id, phone_e164)` for dedup and `memberships (user_id, org_id)`.

**To do in the integrations phase:**
1. **Workers** run as a dedicated role scoped by `app.org_id`, not the service role.
2. **Meta API budget:**
   - Throttle adaptively from the `x-business-use-case-usage`, `x-ad-account-usage` and `x-app-usage` headers, and park an account above 75% usage.
   - Add a global token bucket for the app.
   - Run backfills in a separate lane using async `report_run`.
   - Cadence: today's data hourly, trailing 7 days twice a day, a deep reconcile nightly. Jitter the schedules.
3. **Token lifecycle:**
   - Use System User tokens.
   - On error 190, set `needs_reauth`, stop that integration's jobs, and alert the Owner.
   - Run a daily `debug_token` sweep.
4. **WhatsApp:**
   - Template approval is part of onboarding.
   - Handle the 24-hour window (131047) and pair-rate limits (131056).
   - Write the outbound row before sending, and don't blindly retry a send that timed out.
   - One job at a time per conversation.
   - Status updates only move forward.
5. **Queue lanes:** `bot.process` and `leads.ingest` never wait behind `ads.sync`. Each org gets a fair share.
6. **Caching:** `'use cache'` + `cacheTag` with keys `org:{org}:proj:{p}:dash:{from}:{to}:v{sync_version}`. Authorize the user before reading the cache.
7. **Degradation:**
   - A Meta outage trips a circuit breaker; dashboards show "last synced".
   - An LLM outage falls back to the buttons-only flow.
   - Alert on the age of the oldest job in each lane.
8. **SLIs:**

   | SLI | Target |
   |---|---|
   | Leadgen events persisted in ≤ 5 s | 99.9% |
   | Lead → WhatsApp sent | p95 < 10 s |
   | Accounts synced within 2 h | 99% |
   | Dashboard RPC | p95 < 300 ms |

**Weakest dimension identified:** the Meta dependency, meaning its call budget and its failure story. Size it before the first pilot.
