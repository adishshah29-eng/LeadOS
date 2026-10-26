-- ============================================================================
-- 0014_admin_tools_hardening.sql — fixes from the B6 review.
-- Run after 0013 (SQL Editor → paste → Run).
--
--  1. Members can't write platform entries (support.*, platform.*) into the
--     activity log, so a real support visit can't be faked.
--  2. Health's webhook backlog ignores events the sweeper gave up on; those
--     are counted separately.
--  3. Support reasons: invisible, control and direction characters removed;
--     at least 3 real characters required.
--  5. Starting a support view while one is active reuses it; expired
--     sessions are cleaned up by the hourly job.
--  6. Platform admins need two-factor to list workspaces and members through
--     the API too (the pages already required it).
--  7. Health shows no addresses, user ids, email hashes or long numbers.
--  8. Health lists only counters that are actually blocked, and errors of
--     accounts that are syncing; usage keeps the last good sync time.
--  9. Indexes for the usage and health counts.
-- 11. admin_support_session_active() returns the expiry (or null).
-- ============================================================================

-- 1 ---------------------------------------------------------------------------
create or replace function public.write_audit(p_org uuid, p_action text, p_target text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- Only members can write to their org's log; nobody can forge entries elsewhere.
  if not public.is_member(p_org) then raise exception 'not allowed'; end if;
  -- Platform entries are written only by platform functions.
  if lower(p_action) like 'support.%' or lower(p_action) like 'platform.%' then raise exception 'reserved action'; end if;
  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), left(p_action, 80), left(p_target, 200), coalesce(p_meta, '{}'));
end $$;

-- 3 ---------------------------------------------------------------------------
-- Removes control and invisible/direction characters, folds every kind of
-- space into one, trims. Null when fewer than 3 real characters remain.
create or replace function public.clean_reason(p text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text;
begin
  v := regexp_replace(coalesce(p, ''), '[[:cntrl:]​-‏‪-‮⁠-⁤﻿]', '', 'g');
  v := btrim(regexp_replace(v, '[[:space:]   -     　]+', ' ', 'g'));
  if char_length(regexp_replace(v, '[[:space:][:punct:]]', '', 'g')) < 3 or char_length(v) > 300 then return null; end if;
  return v;
end $$;

-- 6 ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
     and (select auth.jwt() ->> 'aal') = 'aal2'
$$;

-- 8 + 9 -----------------------------------------------------------------------
alter table public.rate_limits add column if not exists max_count integer;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.rate_limits;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count, window_seconds, max_count)
  values (p_key, now(), 1, p_window_seconds, p_max)
  on conflict (key) do update set
    count = case when r.window_start + v_window <= now() then 1 else r.count + 1 end,
    window_start = case when r.window_start + v_window <= now() then now() else r.window_start end,
    window_seconds = p_window_seconds,
    max_count = p_max
  returning * into v;
  if v.count <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from (v.window_start + v_window - now())))::integer);
end $$;

create index if not exists wa_messages_org_created_idx on public.wa_messages (org_id, created_at);
create index if not exists sync_runs_failed_idx on public.sync_runs (org_id, started_at) where status = 'failed';
create index if not exists webhook_events_dead_idx on public.webhook_events (received_at) where processed_at is null;

-- Errors shown to platform staff: first line, long digit runs masked, 200 characters.
create or replace function public.mask_error(p text)
returns text
language sql immutable set search_path = ''
as $$ select left(regexp_replace(split_part(p, E'\n', 1), '[0-9]{7,}', '•••', 'g'), 200) $$;

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
    (select max(a.last_synced_at) from public.ad_accounts a where a.org_id = o.id), -- last good sync, even if the latest failed
    exists (select 1 from public.integrations i where i.org_id = o.id and i.status = 'needs_reauth')
  from public.organizations o
  order by o.created_at desc
  limit 500;
end $$;

-- 2, 7, 8 ---------------------------------------------------------------------
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
          (select public.mask_error(a.last_sync_error) from public.ad_accounts a
            where a.org_id = o.id and a.sync_enabled and a.last_sync_status = 'failed' and a.last_sync_error is not null
            limit 1) as latest_error
        from public.organizations o
      ) f
      where f.failures_24h > 0 or f.latest_error is not null
    ), '[]'::jsonb),
    -- Only events the sweeper still retries (it gives up at 8 attempts).
    'oldest_webhook_seconds', (
      select floor(extract(epoch from (now() - min(received_at))))::integer
      from public.webhook_events where processed_at is null and attempts < 8
    ),
    'dead_webhooks', (select count(*)::integer from public.webhook_events where processed_at is null and attempts >= 8),
    'needs_reauth', coalesce((
      select jsonb_agg(jsonb_build_object('org_id', i.org_id, 'name', o.name, 'kind', i.kind, 'last_error', public.mask_error(i.last_error)))
      from public.integrations i join public.organizations o on o.id = i.org_id
      where i.status = 'needs_reauth'
    ), '[]'::jsonb),
    -- Counters over their limit right now, grouped by type (e.g. "signin:ip"): no addresses, ids or hashes.
    'blocked', coalesce((
      select jsonb_agg(b order by b.keys desc) from (
        select split_part(r.key, ':', 1) || ':' || split_part(r.key, ':', 2) as kind, count(*)::integer as keys
        from public.rate_limits r
        where r.max_count is not null and r.count > r.max_count
          and r.window_start + make_interval(secs => r.window_seconds) > now()
        group by 1
      ) b
    ), '[]'::jsonb)
  );
end $$;

-- 3 + 5 -----------------------------------------------------------------------
create or replace function public.admin_start_support_session(p_org uuid, p_reason text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := public.clean_reason(p_reason);
  v_existing timestamptz;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  perform public.admin_require(array['super_admin']);
  if v_reason is null then raise exception 'give a reason (3–300 characters)'; end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'workspace not found'; end if;
  -- Already looking: reuse the open view (no stacked sessions or log entries).
  select max(expires_at) into v_existing from public.support_sessions
  where admin_id = (select auth.uid()) and org_id = p_org and expires_at > now();
  if v_existing is not null then return v_existing; end if;
  insert into public.support_sessions (admin_id, org_id, reason, expires_at) values ((select auth.uid()), p_org, v_reason, v_expires);
  insert into public.audit_log (org_id, actor_id, action, target) values (p_org, (select auth.uid()), 'support.viewed', v_reason);
  insert into public.platform_log (actor_id, action, target, meta) values ((select auth.uid()), 'support.viewed', p_org::text, jsonb_build_object('reason', v_reason));
  return v_expires;
end $$;

create or replace function public.admin_prune_support_sessions()
returns integer
language sql security definer set search_path = ''
as $$
  with gone as (delete from public.support_sessions where expires_at < now() returning 1)
  select count(*)::integer from gone
$$;
revoke execute on function public.admin_prune_support_sessions() from public, anon, authenticated;
grant execute on function public.admin_prune_support_sessions() to service_role;

-- 11 --------------------------------------------------------------------------
drop function if exists public.admin_support_session_active(uuid);
create function public.admin_support_session_active(p_org uuid)
returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare v timestamptz;
begin
  perform public.admin_require(array['super_admin']);
  select max(expires_at) into v from public.support_sessions
  where admin_id = (select auth.uid()) and org_id = p_org and expires_at > now();
  return v;
end $$;

revoke execute on function public.admin_support_session_active(uuid), public.clean_reason(text), public.mask_error(text) from public, anon;
grant execute on function public.admin_support_session_active(uuid) to authenticated;
