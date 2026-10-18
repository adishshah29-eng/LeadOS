-- ============================================================================
-- 0003_dashboard_breakdown.sql — per-campaign / ad set / ad totals for the
-- dashboard tables. Run after 0002 (SQL Editor → paste → Run).
--
-- SECURITY INVOKER: Row-Level Security on ad_daily and ad_entities applies,
-- so a manager only ever sees the projects they are assigned to.
-- ============================================================================

create or replace function public.get_breakdown(p_org uuid, p_project uuid, p_from date, p_to date, p_level text)
returns table (
  entity_id text,
  name text,
  parent_name text,
  spend numeric,
  impressions bigint,
  clicks bigint,
  results bigint,
  active_days integer
)
language sql stable security invoker set search_path = ''
as $$
  with base as (
    select
      case p_level when 'campaign' then d.campaign_id when 'adset' then d.adset_id else d.ad_id end as entity_id,
      d.date, d.spend, d.impressions, d.clicks, d.results
    from public.ad_daily d
    join public.ad_accounts a on a.id = d.ad_account_id and a.org_id = d.org_id
    where d.org_id = p_org
      and d.date between p_from and p_to
      and (p_project is null or a.project_id = p_project)
      and p_level in ('campaign', 'adset', 'ad')
  )
  select
    b.entity_id,
    coalesce(max(e.name), b.entity_id),
    max(pe.name),
    sum(b.spend),
    sum(b.impressions)::bigint,
    sum(b.clicks)::bigint,
    sum(b.results)::bigint,
    count(distinct b.date)::integer
  from base b
  left join public.ad_entities e
    on e.org_id = p_org and e.level = p_level and e.entity_id = b.entity_id
  left join public.ad_entities pe
    on pe.org_id = p_org and pe.entity_id = e.parent_id
   and pe.level = case p_level when 'ad' then 'adset' when 'adset' then 'campaign' end
  group by b.entity_id
  order by sum(b.spend) desc
  limit 200
$$;

revoke execute on function public.get_breakdown(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.get_breakdown(uuid, uuid, date, date, text) to authenticated;
