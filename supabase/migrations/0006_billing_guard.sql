-- ============================================================================
-- 0006_billing_guard.sql — plan and trial can only be changed by the platform.
-- Run after 0005 (SQL Editor → paste → Run).
--
-- Until now the organizations_update policy let a workspace owner/admin
-- update the whole row through the API, including plan, trial_ends_at and
-- status, i.e. extend their own trial or lift a suspension. Signed-in users
-- may now update only the name; everything else goes through RPCs.
-- ============================================================================

revoke update on public.organizations from anon, authenticated;
grant update (name) on public.organizations to authenticated;

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check
  check (plan in ('trial', 'starter', 'growth', 'agency'));

-- ---------------------------------------------------------------------------
-- Platform admin: change a workspace's plan or extend its trial.
-- Super admins only, signed in with two-factor; every change is logged.
-- p_trial_days adds days to the trial (counted from now if it already ended).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_plan(p_org uuid, p_plan text, p_trial_days int, p_reason text)
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
  if p_plan not in ('trial', 'starter', 'growth', 'agency') then raise exception 'invalid plan'; end if;
  if p_trial_days is not null and (p_trial_days < 1 or p_trial_days > 90) then raise exception 'trial days must be 1-90'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;

  update public.organizations
  set plan = p_plan,
      trial_ends_at = case
        when p_plan = 'trial' and p_trial_days is not null
          then greatest(trial_ends_at, now()) + make_interval(days => p_trial_days)
        else trial_ends_at
      end
  where id = p_org;
  if not found then raise exception 'workspace not found'; end if;

  insert into public.audit_log (org_id, actor_id, action, target, meta)
  values (p_org, (select auth.uid()), 'platform.plan_changed', p_plan,
          jsonb_build_object('trial_days', p_trial_days, 'reason', left(p_reason, 300)));
end $$;

revoke execute on function public.admin_set_plan(uuid, text, int, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, int, text) to authenticated;
