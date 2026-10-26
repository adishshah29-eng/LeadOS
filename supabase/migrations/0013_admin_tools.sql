-- ============================================================================
-- 0013_admin_tools.sql — platform admin: usage, health, read-only support view.
-- Run after 0012 (SQL Editor → paste → Run).
--
-- Every function requires a platform admin signed in with two-factor.
-- Usage and health show counts and errors, never lead names or numbers.
-- A support view lets a super admin read one workspace for 30 minutes after
-- giving a reason; the customer sees the visit in their activity log.
-- ============================================================================

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists support_sessions_lookup_idx on public.support_sessions (admin_id, org_id, expires_at desc);

create table if not exists public.platform_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);

alter table public.support_sessions enable row level security; -- no policies: server-only
alter table public.platform_log enable row level security;
revoke all on public.support_sessions, public.platform_log from anon, authenticated;

-- Raises unless the caller is a platform admin with one of these roles, signed in with two-factor.
create or replace function public.admin_require(p_roles text[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.platform_admins where user_id = (select auth.uid()) and role::text = any (p_roles)
  ) then
    raise exception 'not allowed';
  end if;
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' then raise exception 'two-factor login required'; end if;
end $$;
revoke execute on function public.admin_require(text[]) from public, anon, authenticated;

-- Per-workspace usage. Counts only.
create or replace function public.admin_usage()
returns table (
  org_id uuid, name text, slug text, plan text, status text, members integer, ad_accounts_syncing integer,
  leads_30d integer, wa_messages_30d integer, last_synced_at timestamptz, needs_reauth boolean
)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_require(array['super_admin', 'support']);
  return query
  select o.id, o.name, o.slug::text, o.plan, o.status,
    (select count(*)::integer from public.memberships m where m.org_id = o.id),
    (select count(*)::integer from public.ad_accounts a where a.org_id = o.id and a.sync_enabled),
    (select count(*)::integer from public.leads l where l.org_id = o.id and l.lead_created_at > now() - interval '30 days'),
    (select count(*)::integer from public.wa_messages w where w.org_id = o.id and w.created_at > now() - interval '30 days'),
    (select max(a.last_synced_at) from public.ad_accounts a where a.org_id = o.id and a.last_sync_status is distinct from 'failed'),
    exists (select 1 from public.integrations i where i.org_id = o.id and i.status = 'needs_reauth')
  from public.organizations o
  order by o.created_at desc;
end $$;

-- What's broken right now.
create or replace function public.admin_health()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_require(array['super_admin', 'support']);
  return jsonb_build_object(
    'sync_failures', coalesce((
      select jsonb_agg(f order by f.failures_24h desc) from (
        select o.id as org_id, o.name,
          (select count(*) from public.sync_runs s where s.org_id = o.id and s.status = 'failed' and s.started_at > now() - interval '24 hours') as failures_24h,
          (select a.last_sync_error from public.ad_accounts a where a.org_id = o.id and a.last_sync_status = 'failed'
             order by a.last_synced_at desc nulls last limit 1) as latest_error
        from public.organizations o
      ) f
      where f.failures_24h > 0 or f.latest_error is not null
    ), '[]'::jsonb),
    'oldest_webhook_seconds', (
      select floor(extract(epoch from (now() - min(received_at))))::integer from public.webhook_events where processed_at is null
    ),
    'needs_reauth', coalesce((
      select jsonb_agg(jsonb_build_object('org_id', i.org_id, 'name', o.name, 'kind', i.kind, 'last_error', i.last_error))
      from public.integrations i join public.organizations o on o.id = i.org_id
      where i.status = 'needs_reauth'
    ), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(b) from (
        select r.key, r.count from public.rate_limits r
        where r.window_start + make_interval(secs => r.window_seconds) > now()
        order by r.count desc limit 10
      ) b
    ), '[]'::jsonb)
  );
end $$;

-- A super admin opens one workspace read-only for 30 minutes, with a reason.
create or replace function public.admin_start_support_session(p_org uuid, p_reason text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_expires timestamptz := now() + interval '30 minutes';
begin
  perform public.admin_require(array['super_admin']);
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then raise exception 'give a reason (3–300 characters)'; end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'workspace not found'; end if;
  insert into public.support_sessions (admin_id, org_id, reason, expires_at) values ((select auth.uid()), p_org, v_reason, v_expires);
  insert into public.audit_log (org_id, actor_id, action, target) values (p_org, (select auth.uid()), 'support.viewed', v_reason);
  insert into public.platform_log (actor_id, action, target, meta) values ((select auth.uid()), 'support.viewed', p_org::text, jsonb_build_object('reason', v_reason));
  return v_expires;
end $$;

-- Does the caller have an active support view of this workspace?
create or replace function public.admin_support_session_active(p_org uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.admin_require(array['super_admin']);
  return exists (
    select 1 from public.support_sessions
    where admin_id = (select auth.uid()) and org_id = p_org and expires_at > now()
  );
end $$;

revoke execute on function public.admin_usage(), public.admin_health(), public.admin_start_support_session(uuid, text), public.admin_support_session_active(uuid) from public, anon;
grant execute on function public.admin_usage(), public.admin_health(), public.admin_start_support_session(uuid, text), public.admin_support_session_active(uuid) to authenticated;
