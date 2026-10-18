-- ============================================================================
-- 0004_report_links_and_admin.sql — shareable client reports, and platform
-- admin controls. Run after 0003 (SQL Editor → paste → Run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Report links: a read-only dashboard a client can open without an account.
-- Only the SHA-256 of the link's secret is stored. The link shows totals
-- and campaign numbers, never lead names or contact details.
-- ---------------------------------------------------------------------------
create table if not exists public.report_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  label text not null check (char_length(label) between 1 and 80),
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete cascade
);
create index if not exists report_links_org_idx on public.report_links (org_id, created_at desc);

alter table public.report_links enable row level security;
create policy report_links_select on public.report_links for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy report_links_insert on public.report_links for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]) and created_by = (select auth.uid()));
create policy report_links_update on public.report_links for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- The only way to read a shared report. Callable without signing in; returns
-- aggregates for the link's org and project only, or null for a bad,
-- expired or revoked link (no difference is revealed).
create or replace function public.public_report(p_token_hash text, p_days integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.report_links;
  v_from date;
  v_to date := (now() at time zone 'Asia/Kolkata')::date;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_result jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v from public.report_links
   where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then return null; end if;

  -- Never show a suspended workspace's data.
  if (select status from public.organizations where id = v.org_id) <> 'active' then return null; end if;

  v_from := v_to - (v_days - 1);
  update public.report_links set last_viewed_at = now(), view_count = view_count + 1 where id = v.id;

  with r as (
    select date, spend, impressions, clicks, results
    from public.ad_rollup_daily
    where org_id = v.org_id and level = 'project'
      and (v.project_id is null or project_id = v.project_id)
      and date between v_from and v_to
  ),
  days as (
    select date, sum(spend) spend, sum(results) results from r group by date order by date
  ),
  camps as (
    select coalesce(max(e.name), d.campaign_id) as name,
           sum(d.spend) spend, sum(d.results) results, sum(d.impressions) impressions, sum(d.clicks) clicks
    from public.ad_daily d
    join public.ad_accounts a on a.id = d.ad_account_id and a.org_id = d.org_id
    left join public.ad_entities e on e.org_id = d.org_id and e.level = 'campaign' and e.entity_id = d.campaign_id
    where d.org_id = v.org_id and d.date between v_from and v_to
      and (v.project_id is null or a.project_id = v.project_id)
    group by d.campaign_id
    order by sum(d.spend) desc
    limit 25
  )
  select jsonb_build_object(
    'label', v.label,
    'org_name', (select name from public.organizations where id = v.org_id),
    'project_name', (select name from public.projects where id = v.project_id),
    'from', v_from, 'to', v_to, 'days', v_days, 'expires_at', v.expires_at,
    'spend', coalesce((select sum(spend) from r), 0),
    'results', coalesce((select sum(results) from r), 0),
    'impressions', coalesce((select sum(impressions) from r), 0),
    'clicks', coalesce((select sum(clicks) from r), 0),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'spend', spend, 'results', results)) from days), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(camps)) from camps), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

revoke execute on function public.public_report(text, integer) from public;
grant execute on function public.public_report(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform admin: suspend / reactivate a workspace (super admins only).
-- A suspended workspace can't be opened (see requireOrg) and its report
-- links stop working.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_org_status(p_org uuid, p_status text, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = (select auth.uid()) and role = 'super_admin') then
    raise exception 'not allowed';
  end if;
  if (select (auth.jwt() ->> 'aal')) is distinct from 'aal2' then
    raise exception 'two-factor login required';
  end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid status'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;
  update public.organizations set status = p_status where id = p_org;
  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), 'platform.org_' || p_status, p_org::text, jsonb_build_object('reason', left(p_reason, 300)));
end $$;

revoke execute on function public.admin_set_org_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_org_status(uuid, text, text) to authenticated;
