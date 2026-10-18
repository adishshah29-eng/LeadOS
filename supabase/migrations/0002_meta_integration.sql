-- ============================================================================
-- 0002_meta_integration.sql — Meta connection, sync plumbing, rollups.
--
-- Run after 0001 (SQL Editor → paste → Run).
--
-- Trust model:
--  * Tokens live in Supabase Vault. Admins can STORE a token through
--    connect_meta(); nobody using the app can read one back.
--  * Functions named worker_* are granted to service_role only. Background
--    jobs call them; the web app (publishable key + user session) cannot.
-- ============================================================================

create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- Integrations: one Meta connection per org, with a non-secret snapshot of
-- what the token can see (ad accounts, pages) for the picker UI.
-- ---------------------------------------------------------------------------
alter table public.integrations add column if not exists display_name text;
alter table public.integrations add column if not exists available jsonb not null default '{}'::jsonb;
alter table public.integrations add column if not exists connected_by uuid references auth.users(id) on delete set null;
alter table public.integrations add column if not exists last_checked_at timestamptz;
create unique index if not exists integrations_one_per_kind on public.integrations (org_id, kind);

-- Ad accounts: admins choose which ones to sync and which project they feed.
alter table public.ad_accounts add column if not exists sync_enabled boolean not null default true;
alter table public.ad_accounts add column if not exists last_synced_at timestamptz;
alter table public.ad_accounts add column if not exists last_sync_status text;
alter table public.ad_accounts add column if not exists last_sync_error text;

create policy ad_accounts_insert on public.ad_accounts for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy ad_accounts_delete on public.ad_accounts for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- Facebook Pages whose lead forms feed this org. page_id is globally unique:
-- one page routes its webhooks to exactly one workspace.
create table if not exists public.meta_pages (
  org_id uuid not null references public.organizations(id) on delete cascade,
  page_id text primary key,
  name text not null,
  project_id uuid,
  subscribed_at timestamptz,
  subscribe_error text,
  created_at timestamptz not null default now(),
  foreign key (org_id, project_id) references public.projects(org_id, id) on delete set null (project_id)
);
create index if not exists meta_pages_org_idx on public.meta_pages (org_id);
alter table public.meta_pages enable row level security;
create policy meta_pages_select on public.meta_pages for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy meta_pages_insert on public.meta_pages for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy meta_pages_update on public.meta_pages for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy meta_pages_delete on public.meta_pages for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

-- Lead details that come from Meta.
alter table public.leads add column if not exists ad_id text;
alter table public.leads add column if not exists form_id text;
alter table public.leads add column if not exists page_id text;
alter table public.leads add column if not exists campaign_name text;
alter table public.leads add column if not exists ad_name text;
alter table public.leads add column if not exists field_data jsonb;

-- ---------------------------------------------------------------------------
-- Admin-callable: store / remove the Meta token.
-- ---------------------------------------------------------------------------
create or replace function public.connect_meta(
  p_org uuid, p_token text, p_display_name text, p_scopes text[], p_available jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_int public.integrations;
  v_secret uuid;
  v_id uuid;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'not allowed';
  end if;
  if p_token is null or length(p_token) < 20 then raise exception 'invalid token'; end if;

  select * into v_int from public.integrations where org_id = p_org and kind = 'meta' for update;
  if found and v_int.vault_secret_id is not null then
    perform vault.update_secret(v_int.vault_secret_id, p_token);
    v_secret := v_int.vault_secret_id;
  else
    v_secret := vault.create_secret(p_token, 'meta_token_' || p_org::text, 'Meta token for org ' || p_org::text);
  end if;

  insert into public.integrations (org_id, kind, status, vault_secret_id, scopes, display_name, available, connected_by, last_checked_at, last_error)
  values (p_org, 'meta', 'active', v_secret, coalesce(p_scopes, '{}'), p_display_name, coalesce(p_available, '{}'), (select auth.uid()), now(), null)
  on conflict (org_id, kind) do update set
    status = 'active', vault_secret_id = excluded.vault_secret_id, scopes = excluded.scopes,
    display_name = excluded.display_name, available = excluded.available,
    connected_by = excluded.connected_by, last_checked_at = now(), last_error = null
  returning id into v_id;

  insert into public.audit_log (org_id, actor_id, action, target) values (p_org, (select auth.uid()), 'integration.meta.connected', p_display_name);
  return v_id;
end $$;

create or replace function public.disconnect_meta(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_secret uuid;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'not allowed';
  end if;
  select vault_secret_id into v_secret from public.integrations where org_id = p_org and kind = 'meta';
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  update public.integrations set status = 'disabled', vault_secret_id = null where org_id = p_org and kind = 'meta';
  update public.ad_accounts set sync_enabled = false where org_id = p_org;
  insert into public.audit_log (org_id, actor_id, action) values (p_org, (select auth.uid()), 'integration.meta.disconnected');
end $$;

-- ---------------------------------------------------------------------------
-- Worker-only functions (service_role).
-- ---------------------------------------------------------------------------
create or replace function public.worker_meta_token(p_org uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret
  from public.integrations i
  join vault.decrypted_secrets s on s.id = i.vault_secret_id
  where i.org_id = p_org and i.kind = 'meta' and i.status = 'active'
$$;

-- Upserts ad-day rows. Unchanged rows are skipped (no dead tuples), which
-- matters because every sync re-pulls trailing days that mostly don't change.
create or replace function public.worker_upsert_ad_daily(p_org uuid, p_account uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.ad_daily as d (org_id, ad_account_id, date, ad_id, adset_id, campaign_id, spend, impressions, clicks, results, actions, synced_at)
  select p_org, p_account, (r->>'date')::date, r->>'ad_id', r->>'adset_id', r->>'campaign_id',
         coalesce((r->>'spend')::numeric, 0), coalesce((r->>'impressions')::bigint, 0),
         coalesce((r->>'clicks')::bigint, 0), coalesce((r->>'results')::int, 0), r->'actions', now()
  from jsonb_array_elements(p_rows) r
  on conflict (org_id, ad_account_id, date, ad_id) do update set
    adset_id = excluded.adset_id, campaign_id = excluded.campaign_id, spend = excluded.spend,
    impressions = excluded.impressions, clicks = excluded.clicks, results = excluded.results,
    actions = excluded.actions, synced_at = excluded.synced_at
  where (d.spend, d.impressions, d.clicks, d.results) is distinct from
        (excluded.spend, excluded.impressions, excluded.clicks, excluded.results);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.worker_upsert_ad_entities(p_org uuid, p_account uuid, p_rows jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.ad_entities (org_id, ad_account_id, level, entity_id, parent_id, name)
  select distinct on (r->>'level', r->>'entity_id') p_org, p_account, r->>'level', r->>'entity_id', r->>'parent_id', coalesce(r->>'name', '')
  from jsonb_array_elements(p_rows) r
  on conflict (org_id, level, entity_id) do update set name = excluded.name, parent_id = excluded.parent_id
  where public.ad_entities.name is distinct from excluded.name or public.ad_entities.parent_id is distinct from excluded.parent_id;
$$;

-- Rebuilds the dashboard rollups of one project for a date range.
create or replace function public.worker_refresh_rollups(p_org uuid, p_project uuid, p_from date, p_to date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ad_rollup_daily
  where org_id = p_org and project_id = p_project and date between p_from and p_to;

  insert into public.ad_rollup_daily (org_id, project_id, level, entity_id, date, spend, impressions, clicks, results)
  select p_org, p_project, lvl.level, lvl.entity_id, d.date,
         sum(d.spend), sum(d.impressions), sum(d.clicks), sum(d.results)
  from public.ad_daily d
  join public.ad_accounts a on a.id = d.ad_account_id and a.org_id = d.org_id
  cross join lateral (values
    ('project', p_project::text),
    ('account', a.id::text),
    ('campaign', coalesce(d.campaign_id, '?')),
    ('adset', coalesce(d.adset_id, '?'))
  ) as lvl(level, entity_id)
  where d.org_id = p_org and a.project_id = p_project and d.date between p_from and p_to
  group by lvl.level, lvl.entity_id, d.date;
end $$;

-- Inserts leads from Meta; existing ones (same meta_lead_id) are left alone so
-- statuses and assignments set in the CRM survive re-syncs. Returns new ids.
create or replace function public.worker_ingest_meta_leads(p_org uuid, p_rows jsonb)
returns setof uuid
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with ins as (
    insert into public.leads (org_id, project_id, meta_lead_id, name, phone_e164, email, source,
                              ad_id, ad_name, form_id, page_id, campaign_name, field_data, lead_created_at)
    select p_org, nullif(r->>'project_id', '')::uuid, r->>'meta_lead_id', nullif(r->>'name', ''),
           nullif(r->>'phone_e164', ''), nullif(r->>'email', ''), 'meta',
           r->>'ad_id', r->>'ad_name', r->>'form_id', r->>'page_id', r->>'campaign_name', r->'field_data',
           coalesce((r->>'created_time')::timestamptz, now())
    from jsonb_array_elements(p_rows) r
    on conflict (org_id, meta_lead_id) where meta_lead_id is not null do nothing
    returning id
  ), ev as (
    insert into public.lead_events (org_id, lead_id, type, payload)
    select p_org, ins.id, 'created', '{"source":"meta"}'::jsonb from ins
  )
  select id from ins;
end $$;

revoke execute on function
  public.worker_meta_token(uuid),
  public.worker_upsert_ad_daily(uuid, uuid, jsonb),
  public.worker_upsert_ad_entities(uuid, uuid, jsonb),
  public.worker_refresh_rollups(uuid, uuid, date, date),
  public.worker_ingest_meta_leads(uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.worker_meta_token(uuid),
  public.worker_upsert_ad_daily(uuid, uuid, jsonb),
  public.worker_upsert_ad_entities(uuid, uuid, jsonb),
  public.worker_refresh_rollups(uuid, uuid, date, date),
  public.worker_ingest_meta_leads(uuid, jsonb)
to service_role;

revoke execute on function public.connect_meta(uuid, text, text, text[], jsonb), public.disconnect_meta(uuid) from public, anon;
grant execute on function public.connect_meta(uuid, text, text, text[], jsonb), public.disconnect_meta(uuid) to authenticated;
