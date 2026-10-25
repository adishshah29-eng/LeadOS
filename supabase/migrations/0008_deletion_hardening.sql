-- ============================================================================
-- 0008_deletion_hardening.sql — fixes from the B2 security review.
-- Run after 0007 (SQL Editor → paste → Run).
--
-- 1. Account deletion is server-only: the app calls delete_user_account()
--    with the service key only after re-checking the password and 2FA.
--    (Before, any signed-in session could call delete_my_account() directly.)
-- 2. Suspended workspaces can't be deleted, and every deletion is recorded in
--    a platform-only deletion_log that survives the wipe.
-- 4. A deleted user's email is removed from other workspaces' activity log
--    and invitations.
-- 6. Typed names are trimmed like JavaScript's trim() (tabs, line breaks, NBSP).
-- 7. Owned workspaces are locked during account deletion, so an invite
--    accepted at the same moment can't join a workspace that is being wiped.
-- ============================================================================

-- Platform-only record of deletions. RLS on with no policies: users can't read it.
create table if not exists public.deletion_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('workspace', 'account')),
  subject_id uuid not null,
  actor_id uuid,
  at timestamptz not null default now()
);
alter table public.deletion_log enable row level security;
revoke all on public.deletion_log from anon, authenticated;

-- JavaScript-style trim: spaces, tabs, line breaks and non-breaking spaces.
create or replace function public.trim_text(p text)
returns text
language sql immutable set search_path = ''
as $$ select regexp_replace(p, '^[\s ]+|[\s ]+$', '', 'g') $$;

-- purge_organization gains the actor, for the deletion record.
drop function if exists public.purge_organization(uuid);
create function public.purge_organization(p_org uuid, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = p_org) then return; end if;
  delete from vault.secrets
  where id in (select vault_secret_id from public.integrations where org_id = p_org and vault_secret_id is not null);
  delete from public.audit_log where org_id = p_org;
  delete from public.organizations where id = p_org;
  insert into public.deletion_log (kind, subject_id, actor_id) values ('workspace', p_org, p_actor);
end $$;

revoke execute on function public.purge_organization(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_organization(uuid, uuid) to service_role;

create or replace function public.delete_organization(p_org uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.organizations;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if not exists (
    select 1 from public.memberships where org_id = p_org and user_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only the owner can delete this workspace';
  end if;
  perform public.require_second_factor_if_enrolled();
  select * into v from public.organizations where id = p_org for update;
  if v.status = 'suspended' then raise exception 'workspace is suspended; contact support'; end if;
  if p_confirm_name is null or public.trim_text(p_confirm_name) = '' or public.trim_text(p_confirm_name) <> public.trim_text(v.name) then
    raise exception 'the name does not match';
  end if;
  perform public.purge_organization(p_org, (select auth.uid()));
end $$;

-- The user-callable version skipped the app's password re-check. Gone.
drop function if exists public.delete_my_account();

-- Server-only: the app calls this after re-checking password and 2FA.
create or replace function public.delete_user_account(p_uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_blocking text;
  v_suspended text;
  v_org uuid;
begin
  select email into v_email from auth.users where id = p_uid;
  if v_email is null then raise exception 'user not found'; end if;

  -- Lock the workspaces this user owns: an invite accepted now waits, then fails.
  perform 1 from public.organizations
  where id in (select org_id from public.memberships where user_id = p_uid and role = 'owner')
  for update;

  select o.name into v_blocking
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = p_uid and m.role = 'owner'
    and exists (select 1 from public.memberships x where x.org_id = m.org_id and x.user_id <> p_uid)
  order by o.name
  limit 1;
  if v_blocking is not null then raise exception 'owns workspace with members: %', v_blocking; end if;

  select o.name into v_suspended
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = p_uid and m.role = 'owner' and o.status = 'suspended'
  order by o.name limit 1;
  if v_suspended is not null then raise exception 'owns suspended workspace: %; contact support', v_suspended; end if;

  for v_org in select org_id from public.memberships where user_id = p_uid and role = 'owner' loop
    perform public.purge_organization(v_org, p_uid);
  end loop;

  -- Their email stays nowhere else: activity-log mentions and invitations.
  update public.audit_log set target = 'deleted user' where lower(target) = lower(v_email);
  delete from public.invitations where lower(email::text) = lower(v_email);

  insert into public.deletion_log (kind, subject_id, actor_id) values ('account', p_uid, p_uid);
  -- Profile, memberships and project access cascade; authored rows keep a null author.
  delete from auth.users where id = p_uid;
end $$;

revoke execute on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;

