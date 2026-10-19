"use server";

/**
 * Workspace mutations. Each action:
 *  1. validates its input with zod,
 *  2. resolves the org from the slug via requireOrg (membership check),
 *     never from an org id sent by the browser,
 *  3. writes through the user's Supabase client, so RLS has the final say.
 */

import crypto from "node:crypto";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { atLeast, requireOrg, type OrgRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, toE164 } from "@/lib/leads";
import { EV, inngest } from "@/server/jobs/client";

export type ActionState = { error?: string; message?: string; link?: string; values?: Record<string, string> };

const slugSchema = z.string().regex(/^[a-z0-9-]{3,40}$/);
const uuid = z.uuid();

function values(form: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]));
}

async function ctxFor(form: FormData, min: OrgRole) {
  const slug = slugSchema.parse(form.get("slug"));
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, min)) throw new Error("You don't have permission to do that.");
  return ctx;
}

// ---------------------------------------------------------------- projects

export async function createProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["name"]);
  const ctx = await ctxFor(form, "admin");
  const name = z.string().trim().min(1, "Enter a project name").max(80).safeParse(v.name);
  if (!name.success) return { error: name.error.issues[0]?.message, values: v };
  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({ org_id: ctx.org.id, name: name.data });
  if (error) return { error: error.code === "23505" ? "A project with that name already exists." : "Couldn't create the project.", values: v };
  revalidatePath(`/o/${ctx.org.slug}`, "layout");
  return { message: `Project "${name.data}" created.` };
}

/** Sets which managers and viewers can see a project (owners and admins see all). */
export async function setProjectAccess(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await ctxFor(form, "admin");
  const projectId = uuid.parse(form.get("project_id"));
  const chosen = new Set(form.getAll("user_id").map(String).filter((v) => uuid.safeParse(v).success));
  const supabase = await createClient();

  // Only managers and viewers of this org can be granted project access.
  const { data: eligible } = await supabase.from("memberships").select("user_id, role").eq("org_id", ctx.org.id).in("role", ["manager", "viewer"]);
  const allowed = new Set((eligible ?? []).map((m) => m.user_id as string));
  const { data: current } = await supabase.from("project_members").select("user_id").eq("project_id", projectId).eq("org_id", ctx.org.id);
  const had = new Set((current ?? []).map((m) => m.user_id as string));

  const add = [...chosen].filter((u) => allowed.has(u) && !had.has(u));
  const remove = [...had].filter((u) => !chosen.has(u));
  if (add.length) {
    const { error } = await supabase.from("project_members").insert(add.map((user_id) => ({ org_id: ctx.org.id, project_id: projectId, user_id })));
    if (error) return { error: "Couldn't update access." };
  }
  if (remove.length) {
    const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("org_id", ctx.org.id).in("user_id", remove);
    if (error) return { error: "Couldn't update access." };
  }
  if (add.length || remove.length) {
    await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "project.access_changed", p_target: projectId, p_meta: { added: add.length, removed: remove.length } });
  }
  revalidatePath(`/o/${ctx.org.slug}/projects`);
  return { message: "Access saved." };
}

// ------------------------------------------------------------------- leads

const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  project_id: z.union([z.literal(""), uuid]),
});

export async function createLead(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["name", "phone", "email", "project_id"]);
  const ctx = await ctxFor(form, "manager");
  const parsed = leadSchema.safeParse(v);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: v };
  const phone = parsed.data.phone ? toE164(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return { error: "Enter a valid phone number.", values: v };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      org_id: ctx.org.id,
      name: parsed.data.name,
      phone_e164: phone,
      email: parsed.data.email || null,
      project_id: parsed.data.project_id || null,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't add the lead. Managers can only add leads to their own projects.", values: v };
  await supabase.from("lead_events").insert({ org_id: ctx.org.id, lead_id: data.id, actor_id: ctx.userId, type: "note", payload: { text: "Lead added manually" } });
  revalidatePath(`/o/${ctx.org.slug}/leads`);
  return { message: "Lead added." };
}

export async function updateLeadStatus(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "agent");
  const leadId = uuid.parse(form.get("lead_id"));
  const status = z.enum(LEAD_STATUSES).parse(form.get("status"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update({ status }).eq("id", leadId).eq("org_id", ctx.org.id).select("id");
  if (error || !data?.length) throw new Error("Couldn't update this lead.");
  await supabase.from("lead_events").insert({ org_id: ctx.org.id, lead_id: leadId, actor_id: ctx.userId, type: "status_changed", payload: { status } });
  revalidatePath(`/o/${ctx.org.slug}/leads`);
}

export async function assignLead(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "manager");
  const leadId = uuid.parse(form.get("lead_id"));
  const raw = String(form.get("assigned_to") ?? "");
  const assignee = raw ? uuid.parse(raw) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update({ assigned_to: assignee }).eq("id", leadId).eq("org_id", ctx.org.id).select("id");
  if (error || !data?.length) throw new Error("Couldn't assign this lead.");
  await supabase.from("lead_events").insert({ org_id: ctx.org.id, lead_id: leadId, actor_id: ctx.userId, type: "assigned", payload: { assigned_to: assignee } });
  revalidatePath(`/o/${ctx.org.slug}/leads`);
}

export async function addLeadNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["text"]);
  const ctx = await ctxFor(form, "agent");
  const leadId = uuid.parse(form.get("lead_id"));
  const text = z.string().trim().min(1, "Write a note first.").max(2000, "Keep notes under 2,000 characters.").safeParse(v.text);
  if (!text.success) return { error: text.error.issues[0]?.message, values: v };
  const supabase = await createClient();
  // RLS checks the user can see this lead; the insert fails otherwise.
  const { error } = await supabase
    .from("lead_events")
    .insert({ org_id: ctx.org.id, lead_id: leadId, actor_id: ctx.userId, type: "note", payload: { text: text.data } });
  if (error) return { error: "Couldn't save the note.", values: v };
  revalidatePath(`/o/${ctx.org.slug}/leads/${leadId}`);
  return { message: "Note added." };
}

// ---------------------------------------------------------------- whatsapp

export async function setBotPaused(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "agent");
  const conversationId = uuid.parse(form.get("conversation_id"));
  const paused = form.get("paused") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_bot_paused", { p_conversation: conversationId, p_paused: paused });
  if (error) throw new Error("Couldn't change the bot for this lead.");
  revalidatePath(`/o/${ctx.org.slug}/conversations`);
}

/** Queues a manual WhatsApp reply; a worker sends it (the token never reaches the web app). */
export async function sendWhatsAppReply(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["text"]);
  const ctx = await ctxFor(form, "agent");
  const conversationId = uuid.parse(form.get("conversation_id"));
  const text = z.string().trim().min(1, "Write a message first.").max(4000).safeParse(v.text);
  if (!text.success) return { error: text.error.issues[0]?.message, values: v };

  const supabase = await createClient();
  const [{ data: allowed }, { data: conv }] = await Promise.all([
    supabase.rpc("can_reply_conversation", { p_conversation: conversationId }),
    supabase.from("wa_conversations").select("last_inbound_at, state").eq("id", conversationId).eq("org_id", ctx.org.id).maybeSingle(),
  ]);
  if (!allowed || !conv) return { error: "You can't reply to this conversation.", values: v };
  if (conv.state === "opted_out") return { error: "This lead unsubscribed. They can't be messaged unless they write START.", values: v };
  if (!conv.last_inbound_at || Date.now() - Date.parse(conv.last_inbound_at) > 86_400_000) {
    return { error: "WhatsApp only allows free replies within 24 hours of the lead's last message. Call them instead.", values: v };
  }
  await inngest.send({ name: EV.waManual, data: { orgId: ctx.org.id, conversationId, text: text.data, userId: ctx.userId } });
  return { message: "Sending… it appears in the chat in a few seconds." };
}

// -------------------------------------------------------------------- team

const ROLES = ["admin", "manager", "agent", "viewer"] as const;

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["email", "role"]);
  const ctx = await ctxFor(form, "admin");
  const parsed = z.object({ email: z.email("Enter a valid email"), role: z.enum(ROLES) }).safeParse(v);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: v };

  // The raw token only ever exists in the link shown once to the admin.
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invitation", {
    p_org: ctx.org.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: tokenHash,
  });
  if (error) return { error: "Couldn't create the invitation.", values: v };

  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "";
  revalidatePath(`/o/${ctx.org.slug}/team`);
  return {
    message: `Invitation created for ${parsed.data.email}. Send them this link — it works once and expires in 7 days.`,
    link: `${origin}/invite/${token}`,
  };
}

export async function revokeInvite(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "admin");
  const id = uuid.parse(form.get("invite_id"));
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).eq("org_id", ctx.org.id);
  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "member.invite_revoked", p_target: id });
  revalidatePath(`/o/${ctx.org.slug}/team`);
}

export async function changeRole(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "admin");
  const userId = uuid.parse(form.get("user_id"));
  const role = z.enum(ROLES).parse(form.get("role"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { p_org: ctx.org.id, p_user: userId, p_role: role });
  if (error) throw new Error(error.message);
  revalidatePath(`/o/${ctx.org.slug}/team`);
}

export async function removeMember(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "admin");
  const userId = uuid.parse(form.get("user_id"));
  if (userId === ctx.userId) throw new Error("You can't remove yourself.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_org: ctx.org.id, p_user: userId });
  if (error) throw new Error(error.message);
  revalidatePath(`/o/${ctx.org.slug}/team`);
}

// ------------------------------------------------------------ report links

const EXPIRY_DAYS = [7, 30, 90] as const;

/** Creates a read-only report link for a client. The secret is shown once; only its hash is stored. */
export async function createReportLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["label", "project_id", "expires"]);
  const ctx = await ctxFor(form, "admin");
  const parsed = z
    .object({
      label: z.string().trim().min(1, "Give the link a name, e.g. the client's name.").max(80),
      project_id: z.union([z.literal(""), uuid]),
      expires: z.coerce.number().refine((n) => (EXPIRY_DAYS as readonly number[]).includes(n), "Pick an expiry."),
    })
    .safeParse(v);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: v };

  const token = crypto.randomBytes(32).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase.from("report_links").insert({
    org_id: ctx.org.id,
    project_id: parsed.data.project_id || null,
    label: parsed.data.label,
    token_hash: crypto.createHash("sha256").update(token).digest("hex"),
    created_by: ctx.userId,
    expires_at: new Date(Date.now() + parsed.data.expires * 86_400_000).toISOString(),
  });
  if (error) return { error: error.code === "PGRST205" ? "Run migration 0004 first." : "Couldn't create the link.", values: v };
  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "report_link.created", p_target: parsed.data.label });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "";
  revalidatePath(`/o/${ctx.org.slug}/settings`);
  return { message: "Link created. Copy it now; it won't be shown again.", link: `${origin}/r/${token}` };
}

export async function revokeReportLink(form: FormData): Promise<void> {
  const ctx = await ctxFor(form, "admin");
  const id = uuid.parse(form.get("link_id"));
  const supabase = await createClient();
  await supabase.from("report_links").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id);
  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "report_link.revoked", p_target: id });
  revalidatePath(`/o/${ctx.org.slug}/settings`);
}

// ---------------------------------------------------------------- settings

export async function renameOrg(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = values(form, ["name"]);
  const ctx = await ctxFor(form, "admin");
  const name = z.string().trim().min(2, "Name is too short").max(80).safeParse(v.name);
  if (!name.success) return { error: name.error.issues[0]?.message, values: v };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ name: name.data }).eq("id", ctx.org.id);
  if (error) return { error: "Couldn't save.", values: v };
  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "org.renamed", p_target: name.data });
  revalidatePath(`/o/${ctx.org.slug}`, "layout");
  return { message: "Saved." };
}
