-- ============================================================================
-- 0001_tenancy.sql — organizations, roles, and Row-Level Security.
--
-- Run once on a NEW Supabase project (SQL Editor → paste → Run), or with
-- `supabase db push`. Every tenant table carries org_id and has RLS enabled.
--
-- RLS rule of this codebase: ONE role-aware policy per table and command.
-- Postgres ORs permissive policies together, so a generic "any member" policy
-- next to an "agent sees assigned leads" policy would let agents see every
-- lead. Never add a second permissive policy for the same command.
--
-- Tables without any policy (webhook_events, sync_runs writes) are reachable
-- only by background workers.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.org_role as enum ('owner', 'admin', 'manager', 'agent', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.platform_role as enum ('super_admin', 'support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('new', 'contacted', 'site_visit', 'negotiation', 'won', 'lost');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- People and organizations
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  email citext,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  plan text not null default 'trial',
  status text not null default 'active' check (status in ('active', 'suspended')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
-- Lets the API embed a member's profile (name, email) in roster queries.
alter table public.memberships
  add constraint memberships_profile_fk foreign key (user_id) references public.profiles(user_id) on delete cascade;
-- auth helpers below look memberships up by user.
create index memberships_user_idx on public.memberships (user_id, org_id);
-- Exactly one owner per org.
create unique index memberships_one_owner on public.memberships (org_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email citext not null,
  role public.org_role not null check (role <> 'owner'),
  token_hash text not null unique,           -- sha256 of the token; the token itself is never stored
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (org_id, created_at desc);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, id),                       -- target for composite FKs: a row can't point at another org's project
  unique (org_id, name)
);

create table public.project_members (
  org_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (project_id, user_id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.memberships(org_id, user_id) on delete cascade
);
create index project_members_user_idx on public.project_members (user_id, org_id);

-- ---------------------------------------------------------------------------
-- Integrations and ad data
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('meta', 'whatsapp', 'sheets')),
  status text not null default 'pending' check (status in ('pending', 'active', 'needs_reauth', 'disabled')),
  external_id text,                          -- Meta page id / WhatsApp phone_number_id: routes webhooks to this org
  vault_secret_id uuid,                      -- token lives in Supabase Vault, never in this table
  scopes text[] not null default '{}',
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  -- One org owns a page/number, so a webhook maps to exactly one tenant.
  unique (kind, external_id)
);
create index integrations_org_idx on public.integrations (org_id, kind);

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  meta_account_id text not null,             -- "act_123"
  name text not null,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  result_action_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, meta_account_id),
  unique (org_id, id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id)
);

-- Raw ad-day facts. Partitioned by month; the default partition catches
-- everything until a scheduled job starts creating monthly partitions.
create table public.ad_daily (
  org_id uuid not null,
  ad_account_id uuid not null,
  date date not null,                        -- in the ad account's own timezone
  ad_id text not null,
  adset_id text,
  campaign_id text,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  results integer not null default 0,
  actions jsonb,                             -- raw actions so a result-type change can be recomputed without re-fetching
  synced_at timestamptz not null default now(),
  primary key (org_id, ad_account_id, date, ad_id),
  foreign key (org_id, ad_account_id) references public.ad_accounts(org_id, id) on delete cascade
) partition by range (date);
create table public.ad_daily_default partition of public.ad_daily default with (fillfactor = 85);
create index ad_daily_account_date_idx on public.ad_daily (org_id, ad_account_id, date) include (ad_id, spend, results);

create table public.ad_entities (
  org_id uuid not null,
  ad_account_id uuid not null,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  entity_id text not null,
  parent_id text,
  name text not null,
  effective_status text,
  primary key (org_id, level, entity_id),
  foreign key (org_id, ad_account_id) references public.ad_accounts(org_id, id) on delete cascade
);

-- Pre-aggregated daily numbers the dashboard reads. Rebuilt for the touched
-- dates after every sync (and for the whole account when it moves project).
create table public.ad_rollup_daily (
  org_id uuid not null,
  project_id uuid not null,
  level text not null check (level in ('project', 'account', 'campaign', 'adset')),
  entity_id text not null,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  results integer not null default 0,
  primary key (org_id, project_id, level, entity_id, date),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade
);
create index ad_rollup_daily_read_idx on public.ad_rollup_daily (org_id, project_id, level, date) include (entity_id, spend, results);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  meta_lead_id text,
  name text check (char_length(name) <= 200),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email citext,
  status public.lead_status not null default 'new',
  score text check (score in ('hot', 'warm', 'cold')),
  source text not null default 'manual',
  assigned_to uuid,
  duplicate_of uuid references public.leads(id) on delete set null,
  lead_created_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id),
  foreign key (org_id, assigned_to) references public.memberships(org_id, user_id) on delete set null (assigned_to)
);
create unique index leads_meta_id_uq on public.leads (org_id, meta_lead_id) where meta_lead_id is not null;
create index leads_status_idx on public.leads (org_id, status, lead_created_at desc, id);
create index leads_assignee_idx on public.leads (org_id, assigned_to, status, lead_created_at desc, id);
create index leads_project_idx on public.leads (org_id, project_id, lead_created_at desc, id);
create index leads_phone_idx on public.leads (org_id, phone_e164);
create index leads_recent_idx on public.leads (org_id, lead_created_at desc, id);

-- Append-only timeline per lead.
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('created', 'status_changed', 'assigned', 'note', 'message')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade
);
create index lead_events_lead_idx on public.lead_events (org_id, lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Worker-only tables (no RLS policies → users can't touch them)
-- ---------------------------------------------------------------------------
-- Inbox for incoming webhooks: persisted before we ACK, so an outage further
-- down the pipeline never loses a lead. A sweeper re-enqueues stale rows.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null,
  org_id uuid references public.organizations(id) on delete cascade,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique (kind, dedupe_key)
);
create index webhook_events_pending_idx on public.webhook_events (received_at) where processed_at is null;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ad_account_id uuid,
  kind text not null,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_upserted integer,
  meta_usage_pct numeric(5, 2),
  error_code text
);
create index sync_runs_account_idx on public.sync_runs (org_id, ad_account_id, started_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  impersonator_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, at desc);

-- ---------------------------------------------------------------------------
-- Auth helpers. SECURITY DEFINER so policies can read memberships without
-- recursing into memberships' own RLS. search_path is pinned to stop
-- search-path hijacking.
-- ---------------------------------------------------------------------------
create or replace function public.org_role_of(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = p_org and m.user_id = (select auth.uid())
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  )
$$;

create or replace function public.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()))
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;

-- Owners/admins see every project; managers and viewers only the projects
-- they are assigned to.
create or replace function public.can_see_project(p_org uuid, p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_org_role(p_org, array['owner', 'admin']::public.org_role[])
      or (
        public.has_org_role(p_org, array['manager', 'viewer']::public.org_role[])
        and exists (
          select 1 from public.project_members pm
          where pm.project_id = p_project and pm.user_id = (select auth.uid())
        )
      )
$$;

-- The single read rule for a lead, shared by leads and lead_events.
create or replace function public.can_see_lead(p_org uuid, p_project uuid, p_assignee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case public.org_role_of(p_org)
    when 'owner' then true
    when 'admin' then true
    when 'manager' then p_project is not null and public.can_see_project(p_org, p_project)
    when 'agent' then p_assignee = (select auth.uid())
    else false   -- viewers see dashboards, not lead PII
  end
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
-- org_id never changes after insert: moving rows between tenants is never legitimate.
create or replace function public.forbid_org_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable';
  end if;
  return new;
end $$;

create trigger leads_org_immutable before update on public.leads
  for each row execute function public.forbid_org_change();
create trigger projects_org_immutable before update on public.projects
  for each row execute function public.forbid_org_change();
create trigger memberships_org_immutable before update on public.memberships
  for each row execute function public.forbid_org_change();

-- Agents may change status of their own leads, nothing else.
create or replace function public.guard_agent_lead_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.org_role_of(old.org_id) = 'agent' then
    if new.assigned_to is distinct from old.assigned_to
       or new.project_id is distinct from old.project_id
       or new.phone_e164 is distinct from old.phone_e164
       or new.email is distinct from old.email then
      raise exception 'agents can only update status';
    end if;
  end if;
  return new;
end $$;

create trigger leads_agent_guard before update on public.leads
  for each row execute function public.guard_agent_lead_update();

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs: the only way to do multi-row, privileged writes from the app.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(p_org uuid, p_action text, p_target text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- Only members can write to their org's log; nobody can forge entries elsewhere.
  if not public.is_member(p_org) then raise exception 'not allowed'; end if;
  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), left(p_action, 80), left(p_target, 200), coalesce(p_meta, '{}'));
end $$;

-- Creates the org and its owner membership atomically.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.memberships where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'organization limit reached';
  end if;
  insert into public.organizations (name, slug, created_by) values (trim(p_name), lower(p_slug), v_uid)
  returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.audit_log (org_id, actor_id, action, target) values (v_org, v_uid, 'org.created', p_slug);
  return v_org;
end $$;

-- Admins create invitations; the app hashes the token, shows the link once.
create or replace function public.create_invitation(p_org uuid, p_email text, p_role public.org_role, p_token_hash text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'not allowed';
  end if;
  if p_role = 'owner' then raise exception 'cannot invite an owner'; end if;
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, lower(trim(p_email)), p_role, p_token_hash, (select auth.uid()))
  returning id into v_id;
  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), 'member.invited', lower(trim(p_email)), jsonb_build_object('role', p_role));
  return v_id;
end $$;

-- The signed-in user accepts an invitation addressed to their email.
create or replace function public.accept_invitation(p_token_hash text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := (select email from auth.users where id = (select auth.uid()));
  v_inv public.invitations;
  v_slug text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_inv from public.invitations
   where token_hash = p_token_hash and accepted_at is null and expires_at > now()
   for update;
  if not found then raise exception 'invitation is invalid or expired'; end if;
  if lower(v_inv.email) <> lower(v_email) then raise exception 'invitation was sent to a different email'; end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.audit_log (org_id, actor_id, action, target) values (v_inv.org_id, v_uid, 'member.joined', v_email);
  select slug into v_slug from public.organizations where id = v_inv.org_id;
  return v_slug;
end $$;

-- Change a member's role. Owners can't be demoted here (ownership transfer is a separate flow).
create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then raise exception 'not allowed'; end if;
  if p_role = 'owner' then raise exception 'use ownership transfer'; end if;
  if (select role from public.memberships where org_id = p_org and user_id = p_user) = 'owner' then
    raise exception 'cannot change the owner''s role';
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), 'member.role_changed', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then raise exception 'not allowed'; end if;
  if (select role from public.memberships where org_id = p_org and user_id = p_user) = 'owner' then
    raise exception 'cannot remove the owner';
  end if;
  delete from public.memberships where org_id = p_org and user_id = p_user;
  insert into public.audit_log (org_id, actor_id, action, target) values (p_org, (select auth.uid()), 'member.removed', p_user::text);
end $$;

-- Dashboard in one round-trip. SECURITY INVOKER → RLS on ad_rollup_daily applies.
create or replace function public.get_dashboard(p_org uuid, p_project uuid, p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with r as (
    select date, spend, impressions, clicks, results
    from public.ad_rollup_daily
    where org_id = p_org and level = 'project'
      and (p_project is null or project_id = p_project)
      and date between p_from and p_to
  ),
  days as (
    select date, sum(spend) spend, sum(results) results, sum(clicks) clicks, sum(impressions) impressions
    from r group by date order by date
  )
  select jsonb_build_object(
    'spend', coalesce(sum(spend), 0),
    'results', coalesce(sum(results), 0),
    'clicks', coalesce(sum(clicks), 0),
    'impressions', coalesce(sum(impressions), 0),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', d.date, 'spend', d.spend, 'results', d.results)) from days d), '[]'::jsonb)
  )
  from r
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.integrations enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_daily enable row level security;
alter table public.ad_entities enable row level security;
alter table public.ad_rollup_daily enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.sync_runs enable row level security;
alter table public.audit_log enable row level security;

-- profiles: yourself, or people you share an org with.
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.user_id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- organizations: members read; owner/admin update; platform staff read (metadata only — no lead access).
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

-- memberships: members see their org's roster. Writes go through RPCs only.
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(org_id) or public.is_platform_admin());

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (public.can_see_project(org_id, id) or public.org_role_of(org_id) = 'agent');
create policy projects_insert on public.projects for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy projects_update on public.projects for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy project_members_select on public.project_members for select to authenticated
  using (public.is_member(org_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- integrations: owner/admin only (tokens live in Vault, not here).
create policy integrations_select on public.integrations for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy ad_accounts_select on public.ad_accounts for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[])
         or (project_id is not null and public.can_see_project(org_id, project_id)));
create policy ad_accounts_update on public.ad_accounts for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy ad_daily_select on public.ad_daily for select to authenticated using (
  exists (select 1 from public.ad_accounts a
          where a.id = ad_daily.ad_account_id and a.org_id = ad_daily.org_id
            and (public.has_org_role(a.org_id, array['owner', 'admin']::public.org_role[])
                 or (a.project_id is not null and public.can_see_project(a.org_id, a.project_id))))
);
create policy ad_entities_select on public.ad_entities for select to authenticated using (
  exists (select 1 from public.ad_accounts a
          where a.id = ad_entities.ad_account_id and a.org_id = ad_entities.org_id
            and (public.has_org_role(a.org_id, array['owner', 'admin']::public.org_role[])
                 or (a.project_id is not null and public.can_see_project(a.org_id, a.project_id))))
);
create policy ad_rollup_daily_select on public.ad_rollup_daily for select to authenticated
  using (public.can_see_project(org_id, project_id));

-- leads: one role-aware rule for read; writes by role.
create policy leads_select on public.leads for select to authenticated
  using (public.can_see_lead(org_id, project_id, assigned_to));
create policy leads_insert on public.leads for insert to authenticated
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.org_role[])
    or (public.org_role_of(org_id) = 'manager' and project_id is not null and public.can_see_project(org_id, project_id))
  );
create policy leads_update on public.leads for update to authenticated
  using (public.can_see_lead(org_id, project_id, assigned_to) and public.org_role_of(org_id) <> 'viewer')
  with check (public.can_see_lead(org_id, project_id, assigned_to));
create policy leads_delete on public.leads for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy lead_events_select on public.lead_events for select to authenticated using (
  exists (select 1 from public.leads l where l.id = lead_events.lead_id and l.org_id = lead_events.org_id
          and public.can_see_lead(l.org_id, l.project_id, l.assigned_to))
);
create policy lead_events_insert on public.lead_events for insert to authenticated with check (
  actor_id = (select auth.uid())
  and type in ('note', 'status_changed', 'assigned')
  and exists (select 1 from public.leads l where l.id = lead_events.lead_id and l.org_id = lead_events.org_id
              and public.can_see_lead(l.org_id, l.project_id, l.assigned_to))
  and public.org_role_of(org_id) <> 'viewer'
);

create policy sync_runs_select on public.sync_runs for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- webhook_events: RLS on, no policy → workers only.

-- Audit log is append-only, even for the API roles.
revoke update, delete on public.audit_log from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
-- Partitions are separate tables: block direct access so RLS on ad_daily can't be bypassed.
revoke all on public.ad_daily_default from anon, authenticated;
alter table public.ad_daily_default enable row level security;

-- Functions: callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.org_role_of(uuid), public.has_org_role(uuid, public.org_role[]), public.is_member(uuid),
  public.is_platform_admin(), public.can_see_project(uuid, uuid), public.can_see_lead(uuid, uuid, uuid),
  public.write_audit(uuid, text, text, jsonb), public.create_organization(text, text),
  public.create_invitation(uuid, text, public.org_role, text), public.accept_invitation(text),
  public.set_member_role(uuid, uuid, public.org_role), public.remove_member(uuid, uuid),
  public.get_dashboard(uuid, uuid, date, date)
to authenticated;
