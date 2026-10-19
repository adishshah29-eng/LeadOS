-- ============================================================================
-- 0005_whatsapp_bot.sql — per-workspace WhatsApp lead bot.
-- Run after 0004 (SQL Editor → paste → Run).
--
-- Workers (service role) do all sending and state changes. Signed-in users
-- can read conversations for leads they can see, change bot settings
-- (owner/admin), pause the bot on a lead, and ask for a manual reply, which a
-- worker sends (the WhatsApp token never reaches the web app).
-- ============================================================================

-- One WhatsApp number per workspace; external_id = phone_number_id, which
-- routes incoming messages to the workspace (unique across all workspaces).
-- (integrations table and its (kind, external_id) unique index exist since 0001.)

create table if not exists public.bot_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  -- Leads that arrived before this moment are never messaged automatically.
  enabled_at timestamptz,
  business_name text not null default '' check (char_length(business_name) <= 80),
  questions jsonb not null default '[]'::jsonb,
  templates jsonb not null default '{"welcome":"lead_welcome","nudge":"lead_nudge","followup":"lead_followup","language":"en"}'::jsonb,
  knowledge text not null default '' check (char_length(knowledge) <= 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.bot_settings enable row level security;
create policy bot_settings_select on public.bot_settings for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy bot_settings_insert on public.bot_settings for insert to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy bot_settings_update on public.bot_settings for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.org_role[]));

create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  phone text not null,                      -- digits only, with country code
  name text,
  project_id uuid,
  -- awaiting_start | in_progress | completed | not_interested | opted_out
  -- | no_response | undeliverable | failed | duplicate
  state text not null default 'awaiting_start',
  answers jsonb not null default '{}'::jsonb,
  score text check (score in ('hot', 'warm', 'cold')),
  summary text,
  lead_questions text,
  bot_paused boolean not null default false,
  needs_attention boolean not null default false,
  attention_reason text,
  off_topic_count integer not null default 0,
  llm_calls_date date,
  llm_calls_count integer not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  followup_track text check (followup_track in ('nudge', 'nurture')),
  followup_stage integer not null default 0,
  followups_sent integer not null default 0,
  unanswered_followups integer not null default 0,
  next_followup_at timestamptz,
  error text,
  updated_at timestamptz not null default now(),
  unique (org_id, lead_id),
  unique (org_id, id),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade
);
create index if not exists wa_conv_phone_idx on public.wa_conversations (org_id, phone, started_at desc);
create index if not exists wa_conv_attention_idx on public.wa_conversations (org_id, needs_attention, updated_at desc);
create index if not exists wa_conv_followup_idx on public.wa_conversations (next_followup_at) where next_followup_at is not null and bot_paused = false;

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  wa_message_id text unique,
  kind text not null,                        -- text | buttons | list | template:<name> | manual | button | interactive | media …
  body text,
  status text,                               -- out: queued | sent | delivered | read | failed
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (org_id, conversation_id) references public.wa_conversations(org_id, id) on delete cascade
);
create index if not exists wa_messages_conv_idx on public.wa_messages (org_id, conversation_id, created_at);

-- Daily AI use per workspace (cost control) and model cooldowns. Worker-only.
create table if not exists public.llm_usage (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  model text,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists llm_usage_org_idx on public.llm_usage (org_id, created_at desc);
create table if not exists public.llm_model_state (
  model text primary key,
  cooldown_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.llm_usage enable row level security;
alter table public.llm_model_state enable row level security;

-- Conversations and messages follow the visibility of their lead.
create policy wa_conversations_select on public.wa_conversations for select to authenticated using (
  exists (select 1 from public.leads l where l.id = wa_conversations.lead_id and l.org_id = wa_conversations.org_id
          and public.can_see_lead(l.org_id, l.project_id, l.assigned_to))
);
create policy wa_messages_select on public.wa_messages for select to authenticated using (
  exists (select 1 from public.wa_conversations c join public.leads l on l.id = c.lead_id and l.org_id = c.org_id
          where c.id = wa_messages.conversation_id and c.org_id = wa_messages.org_id
            and public.can_see_lead(l.org_id, l.project_id, l.assigned_to))
);

-- Pause / resume the bot on one lead (anyone who can work the lead).
create or replace function public.set_bot_paused(p_conversation uuid, p_paused boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_lead uuid;
begin
  select c.org_id, c.lead_id into v_org, v_lead from public.wa_conversations c
  join public.leads l on l.id = c.lead_id and l.org_id = c.org_id
  where c.id = p_conversation
    and public.can_see_lead(l.org_id, l.project_id, l.assigned_to)
    and public.org_role_of(l.org_id) <> 'viewer';
  if v_org is null then raise exception 'not allowed'; end if;
  update public.wa_conversations
     set bot_paused = p_paused,
         needs_attention = case when p_paused then needs_attention else false end,
         next_followup_at = case when p_paused then null else next_followup_at end,
         updated_at = now()
   where id = p_conversation;
  insert into public.lead_events (org_id, lead_id, actor_id, type, payload)
  values (v_org, v_lead, (select auth.uid()), 'note', jsonb_build_object('text', case when p_paused then 'WhatsApp bot paused' else 'WhatsApp bot resumed' end));
end $$;

-- Who may send a manual WhatsApp reply on a conversation (checked by the
-- server action before it queues the send for a worker).
create or replace function public.can_reply_conversation(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wa_conversations c
    join public.leads l on l.id = c.lead_id and l.org_id = c.org_id
    where c.id = p_conversation
      and public.can_see_lead(l.org_id, l.project_id, l.assigned_to)
      and public.org_role_of(l.org_id) <> 'viewer'
  )
$$;

-- Admin-callable: store the WhatsApp token in Vault, like connect_meta().
create or replace function public.connect_whatsapp(
  p_org uuid, p_token text, p_phone_number_id text, p_display_name text, p_available jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_int public.integrations;
  v_secret uuid;
  v_id uuid;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then raise exception 'not allowed'; end if;
  if p_token is null or length(p_token) < 20 then raise exception 'invalid token'; end if;
  if p_phone_number_id !~ '^\d{6,20}$' then raise exception 'invalid phone number id'; end if;

  select * into v_int from public.integrations where org_id = p_org and kind = 'whatsapp' for update;
  if found and v_int.vault_secret_id is not null then
    perform vault.update_secret(v_int.vault_secret_id, p_token);
    v_secret := v_int.vault_secret_id;
  else
    v_secret := vault.create_secret(p_token, 'wa_token_' || p_org::text, 'WhatsApp token for org ' || p_org::text);
  end if;

  insert into public.integrations (org_id, kind, status, external_id, vault_secret_id, display_name, available, connected_by, last_checked_at, last_error)
  values (p_org, 'whatsapp', 'active', p_phone_number_id, v_secret, p_display_name, coalesce(p_available, '{}'), (select auth.uid()), now(), null)
  on conflict (org_id, kind) do update set
    status = 'active', external_id = excluded.external_id, vault_secret_id = excluded.vault_secret_id,
    display_name = excluded.display_name, available = excluded.available,
    connected_by = excluded.connected_by, last_checked_at = now(), last_error = null
  returning id into v_id;

  insert into public.audit_log (org_id, actor_id, action, target) values (p_org, (select auth.uid()), 'integration.whatsapp.connected', p_display_name);
  return v_id;
end $$;

create or replace function public.disconnect_whatsapp(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_secret uuid;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]) then raise exception 'not allowed'; end if;
  select vault_secret_id into v_secret from public.integrations where org_id = p_org and kind = 'whatsapp';
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  update public.integrations set status = 'disabled', vault_secret_id = null, external_id = null where org_id = p_org and kind = 'whatsapp';
  update public.bot_settings set enabled = false where org_id = p_org;
  insert into public.audit_log (org_id, actor_id, action) values (p_org, (select auth.uid()), 'integration.whatsapp.disconnected');
end $$;

create or replace function public.worker_wa_token(p_org uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret
  from public.integrations i
  join vault.decrypted_secrets s on s.id = i.vault_secret_id
  where i.org_id = p_org and i.kind = 'whatsapp' and i.status = 'active'
$$;

revoke execute on function public.worker_wa_token(uuid) from public, anon, authenticated;
grant execute on function public.worker_wa_token(uuid) to service_role;
revoke execute on function
  public.set_bot_paused(uuid, boolean), public.can_reply_conversation(uuid),
  public.connect_whatsapp(uuid, text, text, text, jsonb), public.disconnect_whatsapp(uuid)
from public, anon;
grant execute on function
  public.set_bot_paused(uuid, boolean), public.can_reply_conversation(uuid),
  public.connect_whatsapp(uuid, text, text, text, jsonb), public.disconnect_whatsapp(uuid)
to authenticated;
