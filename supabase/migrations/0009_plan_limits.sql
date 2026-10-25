-- ============================================================================
-- 0009_plan_limits.sql — what each plan includes, enforced in the database.
-- Run after 0008 (SQL Editor → paste → Run).
--
-- Only additions over a limit are refused (turning on another ad account,
-- inviting/adding another member, connecting WhatsApp, creating a report
-- link). After a downgrade, what already exists keeps working. Leads are
-- never limited. The same numbers live in src/lib/plans.ts; a test keeps
-- them identical.
-- ============================================================================

create table if not exists public.plan_limits (
  plan text primary key check (plan in ('trial', 'starter', 'growth', 'agency')),
  ad_accounts integer,          -- null = unlimited
  seats integer,                -- null = unlimited; members + pending invites
  whatsapp boolean not null,
  report_links boolean not null
);

insert into public.plan_limits (plan, ad_accounts, seats, whatsapp, report_links) values
  ('trial',   10,   10,   true,  true),
  ('starter', 2,    3,    false, false),
  ('growth',  10,   10,   true,  false),
  ('agency',  null, null, true,  true)
on conflict (plan) do update set
  ad_accounts = excluded.ad_accounts, seats = excluded.seats,
  whatsapp = excluded.whatsapp, report_links = excluded.report_links;

alter table public.plan_limits enable row level security;
drop policy if exists plan_limits_select on public.plan_limits;
create policy plan_limits_select on public.plan_limits for select to authenticated using (true);

-- The limits of a workspace's current plan. Locks the workspace row, so two
-- additions at the same moment are counted one after the other.
create or replace function public.lock_plan_limits(p_org uuid)
returns public.plan_limits
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  perform 1 from public.organizations where id = p_org for update;
  select l.* into v from public.plan_limits l join public.organizations o on o.plan = l.plan where o.id = p_org;
  return v;
end $$;
revoke execute on function public.lock_plan_limits(uuid) from public, anon, authenticated;

-- Ad accounts: only turning an account ON is counted. Accounts are matched by
-- their Meta id, so re-saving an already-on account (an upsert) is never refused.
create or replace function public.enforce_ad_account_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  if not new.sync_enabled then return new; end if;
  if tg_op = 'UPDATE' and old.sync_enabled then return new; end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.ad_accounts where org_id = new.org_id and meta_account_id = new.meta_account_id and sync_enabled
  ) then
    return new;
  end if;
  v := public.lock_plan_limits(new.org_id);
  if v.ad_accounts is not null and (
    select count(*) from public.ad_accounts
    where org_id = new.org_id and sync_enabled and meta_account_id <> new.meta_account_id
  ) >= v.ad_accounts then
    raise exception 'plan limit: ad_accounts';
  end if;
  return new;
end $$;

drop trigger if exists ad_accounts_plan_limit on public.ad_accounts;
create trigger ad_accounts_plan_limit before insert or update of sync_enabled on public.ad_accounts
  for each row execute function public.enforce_ad_account_limit();

-- Seats: members + pending invites, checked when inviting.
create or replace function public.enforce_invite_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  v := public.lock_plan_limits(new.org_id);
  if v.seats is not null and (
    (select count(*) from public.memberships where org_id = new.org_id)
    + (select count(*) from public.invitations where org_id = new.org_id and accepted_at is null and expires_at > now())
  ) >= v.seats then
    raise exception 'plan limit: seats';
  end if;
  return new;
end $$;

drop trigger if exists invitations_plan_limit on public.invitations;
create trigger invitations_plan_limit before insert on public.invitations
  for each row execute function public.enforce_invite_limit();

-- Seats: members, checked again when someone joins (the plan may have changed).
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  if new.role = 'owner' then return new; end if;
  v := public.lock_plan_limits(new.org_id);
  if v.seats is not null and (select count(*) from public.memberships where org_id = new.org_id) >= v.seats then
    raise exception 'plan limit: seats';
  end if;
  return new;
end $$;

drop trigger if exists memberships_plan_limit on public.memberships;
create trigger memberships_plan_limit before insert on public.memberships
  for each row execute function public.enforce_member_limit();

-- WhatsApp: connecting (connect_whatsapp upserts, which always fires the
-- insert trigger). Updates to an existing connection are left alone.
create or replace function public.enforce_whatsapp_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  if new.kind <> 'whatsapp' then return new; end if;
  v := public.lock_plan_limits(new.org_id);
  if not coalesce(v.whatsapp, false) then raise exception 'plan limit: whatsapp'; end if;
  return new;
end $$;

drop trigger if exists integrations_plan_limit on public.integrations;
create trigger integrations_plan_limit before insert on public.integrations
  for each row execute function public.enforce_whatsapp_limit();

-- Client report links: creating one.
create or replace function public.enforce_report_link_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  v := public.lock_plan_limits(new.org_id);
  if not coalesce(v.report_links, false) then raise exception 'plan limit: report_links'; end if;
  return new;
end $$;

drop trigger if exists report_links_plan_limit on public.report_links;
create trigger report_links_plan_limit before insert on public.report_links
  for each row execute function public.enforce_report_link_limit();

revoke execute on function
  public.enforce_ad_account_limit(), public.enforce_invite_limit(), public.enforce_member_limit(),
  public.enforce_whatsapp_limit(), public.enforce_report_link_limit()
from public, anon, authenticated;
