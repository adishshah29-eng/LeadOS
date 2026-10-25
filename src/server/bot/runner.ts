import "server-only";
import { adminDb } from "@/server/supabase-admin";
import { nextFollowupAt, optOutPatch, processMessage, shouldStopFollowups, type ConvPatch, type Conversation, type Inbound, type Outbound } from "./brain";
import { FOLLOWUPS, settingsFromRow, type BotSettings } from "./settings";
import { isAuthSendError, isPermanentSendError, markRead, sendOutbound, sendTemplate, type SendResult, type WaNumber } from "./whatsapp";
import { aiBudgetLeft, geminiClassifier } from "./llm";
import { settingsForPlan } from "@/lib/plans";

/**
 * Runs the bot for one workspace: loads its settings and number, applies the
 * brain's decisions (send, save, update the lead), and logs every message.
 * Called only from background jobs (src/server/jobs/whatsapp.ts).
 */

const DAY = 86_400_000;
const db = () => adminDb();
const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "there";
export const digits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "");

/**
 * `lapsed`: the free trial ended without a paid plan. The bot then starts no
 * new conversations and sends no follow-ups, but still answers people who are
 * already mid-chat, so nobody is left hanging.
 */
export type OrgBot = { orgId: string; settings: BotSettings; number: WaNumber | null; lapsed: boolean };

export async function loadOrgBot(orgId: string): Promise<OrgBot> {
  const [{ data: org }, { data: row }, { data: integ }, { data: token }] = await Promise.all([
    db().from("organizations").select("name, status, plan, trial_ends_at").eq("id", orgId).maybeSingle(),
    db().from("bot_settings").select("*").eq("org_id", orgId).maybeSingle(),
    db().from("integrations").select("external_id, status").eq("org_id", orgId).eq("kind", "whatsapp").maybeSingle(),
    db().rpc("worker_wa_token", { p_org: orgId }),
  ]);
  const o = org as { name: string; status: string; plan: string; trial_ends_at: string } | null;
  const i = integ as { external_id: string | null; status: string } | null;
  const fromRow = settingsFromRow(row as Record<string, unknown> | null, o?.name ?? "");
  // Plans without WhatsApp: the assistant acts as switched off; messages are still stored and flagged for a person.
  const settings = settingsForPlan(fromRow, o?.plan ?? "");
  // Development dry-run (WA_DRY_RUN=1) needs no real token: nothing is actually sent.
  const dryRun = process.env.WA_DRY_RUN === "1" && process.env.NODE_ENV !== "production";
  const tok = (token as string | null) ?? (dryRun ? "dry-run" : null);
  // A suspended workspace never sends.
  const usable = o?.status === "active" && i?.status === "active" && i.external_id && tok;
  const lapsed = o?.plan === "trial" && Date.parse(o.trial_ends_at) <= Date.now();
  return { orgId, settings, number: usable ? { phoneNumberId: i!.external_id!, token: tok! } : null, lapsed };
}

async function recordOut(orgId: string, convId: string, kind: string, body: string, r: SendResult, sentBy?: string) {
  // Revoked or expired token: stop using it and ask the workspace to reconnect.
  if (!r.ok && isAuthSendError(r.code)) {
    await db()
      .from("integrations")
      .update({ status: "needs_reauth", last_error: (r.error ?? "WhatsApp token rejected").slice(0, 500) } as never)
      .eq("org_id", orgId)
      .eq("kind", "whatsapp");
  }
  await db().from("wa_messages").insert({
    org_id: orgId,
    conversation_id: convId,
    direction: "out",
    wa_message_id: r.messageId ?? null,
    kind,
    body: body.slice(0, 4000),
    status: r.ok ? "sent" : "failed",
    error: r.error?.slice(0, 500) ?? null,
    sent_by: sentBy ?? null,
  } as never);
}

const describeOut = (m: Outbound) =>
  m.kind === "text" ? m.body : `${m.body}\n[${(m.kind === "buttons" ? m.buttons : m.rows).map((o) => o.title).join(" | ")}]`;

async function saveConversation(orgId: string, convId: string, leadId: string, patch: ConvPatch, notes: { text: string }[]) {
  await db().from("wa_conversations").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", convId).eq("org_id", orgId);
  // Mirror the score onto the lead so the leads list and filters show it.
  if (patch.score) await db().from("leads").update({ score: patch.score } as never).eq("id", leadId).eq("org_id", orgId);
  if (notes.length) {
    await db().from("lead_events").insert(notes.map((n) => ({ org_id: orgId, lead_id: leadId, type: "message", payload: { text: n.text, channel: "whatsapp" } })) as never);
  }
}

// ------------------------------------------------------------ start for a lead

/**
 * Sends the welcome template to a new lead. Never messages old leads: the
 * lead must have arrived in the last 24h and after the bot was switched on.
 */
export async function startForLead(orgId: string, leadId: string): Promise<{ started: boolean; reason?: string }> {
  const bot = await loadOrgBot(orgId);
  if (!bot.settings.enabled) return { started: false, reason: "bot off" };
  if (!bot.number) return { started: false, reason: "WhatsApp not connected" };
  if (bot.lapsed) return { started: false, reason: "trial ended" };

  const { data: leadRow } = await db().from("leads").select("id, name, phone_e164, lead_created_at, project_id, projects(name)").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  const lead = leadRow as { id: string; name: string | null; phone_e164: string | null; lead_created_at: string; project_id: string | null; projects: { name: string } | null } | null;
  if (!lead) return { started: false, reason: "lead not found" };
  const created = Date.parse(lead.lead_created_at);
  if (Date.now() - created > DAY) return { started: false, reason: "lead older than 24h" };
  if (bot.settings.enabledAt && created < Date.parse(bot.settings.enabledAt)) return { started: false, reason: "lead from before the bot was enabled" };
  const phone = digits(lead.phone_e164);
  if (!phone) return { started: false, reason: "no phone" };

  // Respect an earlier opt-out on this number, and don't double-message repeat enquiries.
  const { data: prev } = await db().from("wa_conversations").select("id, state, started_at").eq("org_id", orgId).eq("phone", phone).order("started_at", { ascending: false }).limit(1);
  const p = (prev as { state: string; started_at: string }[] | null)?.[0];
  let state = "awaiting_start";
  let attention: string | null = null;
  if (p?.state === "opted_out") state = "opted_out";
  else if (p && Date.now() - Date.parse(p.started_at) < 7 * DAY) {
    state = "duplicate";
    attention = "Repeat enquiry (already messaged this week)";
  }

  const { data: inserted, error } = await db()
    .from("wa_conversations")
    .insert({ org_id: orgId, lead_id: lead.id, phone, name: lead.name, project_id: lead.project_id, state, needs_attention: !!attention, attention_reason: attention } as never)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { started: false, reason: "already started" };
  if (error || !inserted) throw new Error(error?.message ?? "could not create conversation");
  const convId = (inserted as { id: string }).id;
  if (state !== "awaiting_start") return { started: false, reason: state };

  const t = bot.settings.templates;
  const r = await sendTemplate(bot.number, phone, t.welcome, t.language, [firstName(lead.name), lead.projects?.name ?? "our projects"]);
  await recordOut(orgId, convId, `template:${t.welcome}`, `[template ${t.welcome}]`, r);
  const patch: ConvPatch & { error?: string | null } = r.ok
    ? { last_outbound_at: new Date().toISOString(), followup_track: "nudge", followup_stage: 0, next_followup_at: new Date(Date.now() + FOLLOWUPS.nudge[0]).toISOString() }
    : { state: r.code === 131026 ? "undeliverable" : "failed", needs_attention: true, attention_reason: "Welcome message not sent", error: `${r.code ?? ""} ${r.error ?? ""}`.trim() };
  await saveConversation(orgId, convId, lead.id, patch, [{ text: r.ok ? "WhatsApp welcome sent" : `WhatsApp welcome failed: ${r.error}` }]);
  return { started: r.ok };
}

// ----------------------------------------------------------------- inbound

export type InboundEvent = Inbound & { from: string; profileName?: string };

const describeIn = (m: InboundEvent) =>
  (m.text ? m.text.slice(0, 2000) : m.buttonText ? `[button] ${m.buttonText}` : m.replyTitle ? `[tap] ${m.replyTitle}` : `[${m.type}]`);

/** Finds the conversation for this number, or creates a lead + conversation for someone who messaged first. */
async function conversationFor(orgId: string, phone: string, profileName?: string): Promise<{ id: string; lead_id: string; created: boolean }> {
  const { data } = await db()
    .from("wa_conversations")
    .select("id, lead_id")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .neq("state", "duplicate")
    .order("started_at", { ascending: false })
    .limit(1);
  const found = (data as { id: string; lead_id: string }[] | null)?.[0];
  if (found) return { ...found, created: false };

  const { data: lead, error } = await db()
    .from("leads")
    .insert({ org_id: orgId, name: profileName?.slice(0, 120) || null, phone_e164: `+${phone}`, source: "whatsapp" } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const leadId = (lead as { id: string }).id;
  await db().from("lead_events").insert({ org_id: orgId, lead_id: leadId, type: "created", payload: { source: "whatsapp" } } as never);
  const { data: conv, error: convErr } = await db()
    .from("wa_conversations")
    .insert({ org_id: orgId, lead_id: leadId, phone, name: profileName ?? null, state: "awaiting_start" } as never)
    .select("id")
    .single();
  if (convErr) throw new Error(convErr.message);
  return { id: (conv as { id: string }).id, lead_id: leadId, created: true };
}

export async function handleInbound(orgId: string, m: InboundEvent): Promise<{ handled: boolean; replies?: number }> {
  const phone = digits(m.from);
  const bot = await loadOrgBot(orgId);
  const target = await conversationFor(orgId, phone, m.profileName);

  // Store first; the unique wa_message_id drops a message Meta delivered twice.
  const { data: stored } = await db()
    .from("wa_messages")
    .upsert({ org_id: orgId, conversation_id: target.id, direction: "in", wa_message_id: m.messageId, kind: m.type, body: describeIn(m) } as never, {
      onConflict: "wa_message_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (!stored?.length) return { handled: false };

  const { data: row } = await db().from("wa_conversations").select("*").eq("id", target.id).single();
  const c = row as Conversation & { lead_id: string };
  if (!bot.number || !bot.settings.enabled) {
    // Bot off: keep the message for people to answer from the inbox. STOP is still honoured.
    const optOut = c.state === "opted_out" ? null : optOutPatch(m);
    await saveConversation(
      orgId,
      c.id,
      c.lead_id,
      { last_inbound_at: new Date().toISOString(), last_message: describeIn(m), needs_attention: true, attention_reason: optOut ? "Unsubscribed" : "New WhatsApp message", ...optOut?.patch },
      optOut ? [{ text: optOut.note }] : [],
    );
    return { handled: true, replies: 0 };
  }

  void markRead(bot.number, m.messageId);
  const { data: history } = await db().from("wa_messages").select("direction, body").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(6);
  const { patch, out, notes } = await processMessage(c, m, {
    settings: bot.settings,
    classify: geminiClassifier(orgId, bot.settings, ((history ?? []) as { direction: string; body: string | null }[]).reverse()),
    aiBudgetLeft: await aiBudgetLeft(orgId),
  });

  let sentAny = false;
  for (const o of out) {
    const r = await sendOutbound(bot.number, phone, o);
    await recordOut(orgId, c.id, o.kind, describeOut(o), r);
    sentAny ||= r.ok;
    if (!r.ok) break; // don't send a follow-on question after a failed message
  }
  if (sentAny) patch.last_outbound_at = new Date().toISOString();
  await saveConversation(orgId, c.id, c.lead_id, patch, notes);
  return { handled: true, replies: out.length };
}

/** WhatsApp delivery receipts: only move forward (sent → delivered → read); failed is final. */
export async function applyStatus(waMessageId: string, status: string, error?: string) {
  const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 };
  const { data } = await db().from("wa_messages").select("id, status").eq("wa_message_id", waMessageId).maybeSingle();
  const cur = data as { id: string; status: string | null } | null;
  if (!cur || (rank[status] ?? 0) <= (rank[cur.status ?? ""] ?? 0) || cur.status === "failed") return;
  await db().from("wa_messages").update({ status, error: error ?? null } as never).eq("id", cur.id);
}

// ------------------------------------------------------------ manual reply

export async function sendManual(orgId: string, conversationId: string, text: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const bot = await loadOrgBot(orgId);
  if (!bot.number) return { ok: false, error: "WhatsApp isn't connected." };
  const { data } = await db().from("wa_conversations").select("id, lead_id, phone, state, last_inbound_at").eq("id", conversationId).eq("org_id", orgId).maybeSingle();
  const c = data as { id: string; lead_id: string; phone: string; state: string; last_inbound_at: string | null } | null;
  if (!c) return { ok: false, error: "Conversation not found." };
  if (c.state === "opted_out") return { ok: false, error: "This lead unsubscribed." };
  if (!c.last_inbound_at || Date.now() - Date.parse(c.last_inbound_at) > DAY) {
    return { ok: false, error: "WhatsApp only allows free replies within 24 hours of the lead's last message." };
  }
  const r = await sendOutbound(bot.number, c.phone, { kind: "text", body: text });
  await recordOut(orgId, c.id, "manual", text, r, userId);
  if (r.ok) {
    await db()
      .from("wa_conversations")
      .update({ last_outbound_at: new Date().toISOString(), needs_attention: false, attention_reason: null, updated_at: new Date().toISOString() } as never)
      .eq("id", c.id);
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ---------------------------------------------------------------- follow-ups

/** Sends every follow-up that is due for one workspace. */
export async function runFollowups(orgId: string): Promise<{ sent: number; stopped: number; failed: number }> {
  const bot = await loadOrgBot(orgId);
  const result = { sent: 0, stopped: 0, failed: 0 };
  // Only workspaces that switched the assistant on reach here; "off" means the plan excludes it:
  // clear pending follow-ups so they don't all fire at once after an upgrade.
  if (bot.number && !bot.settings.enabled) await db().rpc("worker_pause_followups", { p_org: orgId });
  if (!bot.number || !bot.settings.enabled || bot.lapsed) return result;

  const { data } = await db()
    .from("wa_conversations")
    .select("*, leads!inner(status, projects(name))")
    .eq("org_id", orgId)
    .eq("bot_paused", false)
    .lte("next_followup_at", new Date().toISOString())
    .order("next_followup_at")
    .limit(100);
  for (const row of (data ?? []) as (Conversation & { lead_id: string; phone: string; leads: { status: string; projects: { name: string } | null } })[]) {
    if (shouldStopFollowups(row, row.leads.status)) {
      await db()
        .from("wa_conversations")
        .update({ next_followup_at: null, ...(row.state === "awaiting_start" ? { state: "no_response" } : {}) } as never)
        .eq("id", row.id);
      result.stopped++;
      continue;
    }
    const t = bot.settings.templates;
    const template = row.followup_track === "nurture" ? t.followup : t.nudge;
    const r = await sendTemplate(bot.number, row.phone, template, t.language, [firstName(row.name), row.leads.projects?.name ?? "our projects"]);
    await recordOut(orgId, row.id, `template:${template}`, `[follow-up ${row.followup_stage + 1}: ${template}]`, r);
    if (r.ok) {
      const stage = row.followup_stage + 1;
      const next = nextFollowupAt(row, stage, Date.now());
      await db()
        .from("wa_conversations")
        .update({
          followup_stage: stage,
          unanswered_followups: row.unanswered_followups + 1,
          last_outbound_at: new Date().toISOString(),
          next_followup_at: next,
          ...(next === null && row.state === "awaiting_start" ? { state: "no_response" } : {}),
        } as never)
        .eq("id", row.id);
      result.sent++;
    } else {
      result.failed++;
      await db()
        .from("wa_conversations")
        .update(
          (isPermanentSendError(r.code)
            ? { next_followup_at: null, needs_attention: true, attention_reason: "Follow-up not sent", ...(r.code === 131026 ? { state: "undeliverable" } : {}) }
            : { next_followup_at: new Date(Date.now() + DAY).toISOString() }) as never,
        )
        .eq("id", row.id);
    }
  }
  return result;
}
