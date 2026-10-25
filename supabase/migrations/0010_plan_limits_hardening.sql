-- ============================================================================
-- 0010_plan_limits_hardening.sql — fixes from the B3 review.
-- Run after 0009 (SQL Editor → paste → Run).
--
--  2. Ad accounts, report links and connections can't move to another
--     workspace (that skipped the target's limits).
--  3. A report link can only be revoked after creation (no extending,
--     relabelling or un-revoking).
--  4. An ended free trial counts as a plan with nothing included, so direct
--     database calls can't add things after it ends. Leads are still never
--     limited.
--  5. A member accepting another invitation is not refused when the
--     workspace is full (they take no new seat).
--  6. Each pending email takes one seat, and an invite to an existing member
--     takes none.
--  8. worker_pause_followups(): clears follow-ups while the assistant is off.
-- 10. Refreshing an existing WhatsApp connection's token is allowed on any
--     plan; only brand-new connections need a plan with WhatsApp.
-- 11. The limit lock is FOR NO KEY UPDATE, which doesn't conflict with the
--     key-share locks foreign-key checks take.
-- ============================================================================

-- 2. org_id is immutable, as it already is for leads, projects and memberships.
drop trigger if exists ad_accounts_org_immutable on public.ad_accounts;
create trigger ad_accounts_org_immutable before update on public.ad_accounts
  for each row execute function public.forbid_org_change();
drop trigger if exists report_links_org_immutable on public.report_links;
create trigger report_links_org_immutable before update on public.report_links
  for each row execute function public.forbid_org_change();
drop trigger if exists integrations_org_immutable on public.integrations;
create trigger integrations_org_immutable before update on public.integrations
  for each row execute function public.forbid_org_change();

-- 3. After creation a link can only be revoked (once) or have its view count
--    updated by public_report().
create or replace function public.report_links_revoke_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.label, new.project_id, new.token_hash, new.expires_at, new.created_by, new.created_at)
     is distinct from (old.label, old.project_id, old.token_hash, old.expires_at, old.created_by, old.created_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'report links can only be revoked';
  end if;
  return new;
end $$;

drop trigger if exists report_links_revoke_only on public.report_links;
create trigger report_links_revoke_only before update on public.report_links
  for each row execute function public.report_links_revoke_only();

-- 4 + 11. Limits of the current plan; an ended trial includes nothing.
create or replace function public.lock_plan_limits(p_org uuid)
returns public.plan_limits
language plpgsql security definer set search_path = ''
as $$
declare
  v public.plan_limits;
  o public.organizations;
begin
  select * into o from public.organizations where id = p_org for no key update;
  if o.plan = 'trial' and o.trial_ends_at <= now() then
    return row('trial', 0, 0, false, false)::public.plan_limits;
  end if;
  select * into v from public.plan_limits where plan = o.plan;
  return v;
end $$;
revoke execute on function public.lock_plan_limits(uuid) from public, anon, authenticated;

-- 6. Seats taken = members + distinct pending emails that aren't members yet.
create or replace function public.enforce_invite_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  -- No new seat: the email is already invited and pending, or already a member.
  if exists (
    select 1 from public.invitations
    where org_id = new.org_id and lower(email::text) = lower(new.email::text) and accepted_at is null and expires_at > now()
  ) or exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = new.org_id and lower(u.email) = lower(new.email::text)
  ) then
    return new;
  end if;

  v := public.lock_plan_limits(new.org_id);
  if v.seats is not null and (
    (select count(*) from public.memberships where org_id = new.org_id)
    + (select count(distinct lower(i.email::text)) from public.invitations i
       where i.org_id = new.org_id and i.accepted_at is null and i.expires_at > now()
         and not exists (
           select 1 from public.memberships m join auth.users u on u.id = m.user_id
           where m.org_id = new.org_id and lower(u.email) = lower(i.email::text)
         ))
  ) >= v.seats then
    raise exception 'plan limit: seats';
  end if;
  return new;
end $$;

-- 5. Someone already in the workspace takes no new seat.
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  if new.role = 'owner' then return new; end if;
  if exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.user_id) then return new; end if;
  v := public.lock_plan_limits(new.org_id);
  if v.seats is not null and (select count(*) from public.memberships where org_id = new.org_id) >= v.seats then
    raise exception 'plan limit: seats';
  end if;
  return new;
end $$;

-- 10. Only a brand-new WhatsApp connection needs a plan that includes it.
create or replace function public.enforce_whatsapp_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.plan_limits;
begin
  if new.kind <> 'whatsapp' then return new; end if;
  if exists (select 1 from public.integrations where org_id = new.org_id and kind = 'whatsapp') then return new; end if;
  v := public.lock_plan_limits(new.org_id);
  if not coalesce(v.whatsapp, false) then raise exception 'plan limit: whatsapp'; end if;
  return new;
end $$;

-- 8. While the assistant is off (plan without WhatsApp), pending follow-ups
--    are cleared, so nothing fires in a burst after an upgrade.
create or replace function public.worker_pause_followups(p_org uuid)
returns integer
language sql security definer set search_path = ''
as $$
  with paused as (
    update public.wa_conversations set next_followup_at = null
    where org_id = p_org and next_followup_at is not null
    returning 1
  )
  select count(*)::integer from paused
$$;

revoke execute on function public.worker_pause_followups(uuid) from public, anon, authenticated;
grant execute on function public.worker_pause_followups(uuid) to service_role;
revoke execute on function public.report_links_revoke_only() from public, anon, authenticated;
