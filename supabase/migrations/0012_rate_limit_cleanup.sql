-- ============================================================================
-- 0012_rate_limit_cleanup.sql — fixes from the B4 review.
-- Run after 0011 (SQL Editor → paste → Run).
--
-- Each counter remembers its window, so clean-up removes it as soon as the
-- window ends (not a day later). Clean-up no longer runs inside user
-- requests: an hourly background job calls rate_limit_prune().
-- ============================================================================

alter table public.rate_limits add column if not exists window_seconds integer not null default 3600;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.rate_limits;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count, window_seconds)
  values (p_key, now(), 1, p_window_seconds)
  on conflict (key) do update set
    count = case when r.window_start + v_window <= now() then 1 else r.count + 1 end,
    window_start = case when r.window_start + v_window <= now() then now() else r.window_start end,
    window_seconds = p_window_seconds
  returning * into v;

  if v.count <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from (v.window_start + v_window - now())))::integer);
end $$;

create or replace function public.rate_limit_prune()
returns integer
language sql security definer set search_path = ''
as $$
  with gone as (
    delete from public.rate_limits
    where window_start + make_interval(secs => window_seconds) < now()
    returning 1
  )
  select count(*)::integer from gone
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer), public.rate_limit_prune() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer), public.rate_limit_prune() to service_role;
