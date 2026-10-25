-- ============================================================================
-- 0011_rate_limits.sql — attempt counters for sign-in, sign-up, password
-- reset, the account-deletion password check and public report links.
-- Run after 0010 (SQL Editor → paste → Run).
--
-- Fixed windows, counted in one atomic upsert, so parallel attempts can't
-- slip past a limit and every server shares the same counts. Server-only.
-- Keys never hold an email: the app hashes them (src/lib/rate-limit.ts).
-- ============================================================================

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limits enable row level security; -- no policies: server-only
revoke all on public.rate_limits from anon, authenticated;
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Counts one attempt. Returns 0 if it's allowed, otherwise the seconds until
-- the window ends. About 1 call in 100 also removes day-old counters.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.rate_limits;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start + v_window <= now() then 1 else r.count + 1 end,
    window_start = case when r.window_start + v_window <= now() then now() else r.window_start end
  returning * into v;

  if random() < 0.01 then perform public.rate_limit_prune(); end if;

  if v.count <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from (v.window_start + v_window - now())))::integer);
end $$;

create or replace function public.rate_limit_prune()
returns integer
language sql security definer set search_path = ''
as $$
  with gone as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from gone
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer), public.rate_limit_prune() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer), public.rate_limit_prune() to service_role;
