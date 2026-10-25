-- ============================================================================
-- 0007_self_serve_deletion.sql — owners delete a workspace, users delete
-- their account. Run after 0006 (SQL Editor → paste → Run).
--
-- Deletion is immediate and permanent. Everything a workspace owns goes with
-- it (foreign keys cascade from organizations), plus the two things that
-- don't cascade: its audit_log rows and its tokens in Vault.
-- ============================================================================

-- Internal: removes one workspace and everything it owns. Not callable by
-- signed-in users; the two functions below check who may call it.
create or replace function public.purge_organization(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from vault.secrets
  where id in (select vault_secret_id from public.integrations where org_id = p_org and vault_secret_id is not null);
  delete from public.audit_log where org_id = p_org;
  delete from public.organizations where id = p_org;
end $$;

revoke execute on function public.purge_organization(uuid) from public, anon, authenticated;
-- Server-side only (support tools, test cleanup).
grant execute on function public.purge_organization(uuid) to service_role;

-- A user with two-factor login must have passed it in this session.
create or replace function public.require_second_factor_if_enrolled()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified')
     and (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'two-factor login required';
  end if;
end $$;

revoke execute on function public.require_second_factor_if_enrolled() from public, anon, authenticated;

-- The owner deletes their workspace, typing its exact name to confirm.
create or replace function public.delete_organization(p_org uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if not exists (
    select 1 from public.memberships where org_id = p_org and user_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'only the owner can delete this workspace';
  end if;
  perform public.require_second_factor_if_enrolled();
  select name into v_name from public.organizations where id = p_org;
  if p_confirm_name is null or btrim(p_confirm_name) = '' or btrim(p_confirm_name) <> btrim(v_name) then
    raise exception 'the name does not match';
  end if;
  perform public.purge_organization(p_org);
end $$;

revoke execute on function public.delete_organization(uuid, text) from public, anon;
grant execute on function public.delete_organization(uuid, text) to authenticated;

-- A user deletes their own account. Refused while they own a workspace that
-- has other members (that would wipe a team's data); workspaces they own
-- alone are deleted with the account.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_blocking text;
  v_org uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public.require_second_factor_if_enrolled();

  select o.name into v_blocking
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = v_uid and m.role = 'owner'
    and exists (select 1 from public.memberships x where x.org_id = m.org_id and x.user_id <> v_uid)
  order by o.name
  limit 1;
  if v_blocking is not null then
    raise exception 'owns workspace with members: %', v_blocking;
  end if;

  for v_org in select org_id from public.memberships where user_id = v_uid and role = 'owner' loop
    perform public.purge_organization(v_org);
  end loop;

  -- Profile, memberships and project access cascade; authored rows keep a null author.
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- For tests and support: how many of these Vault secrets still exist. Never
-- returns a secret.
create or replace function public.worker_vault_secrets_exist(p_ids uuid[])
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from vault.secrets where id = any(p_ids)
$$;

revoke execute on function public.worker_vault_secrets_exist(uuid[]) from public, anon, authenticated;
grant execute on function public.worker_vault_secrets_exist(uuid[]) to service_role;
