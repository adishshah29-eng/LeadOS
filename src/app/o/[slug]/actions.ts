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
