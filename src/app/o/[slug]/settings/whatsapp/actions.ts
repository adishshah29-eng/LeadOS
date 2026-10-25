"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MetaApiError, MetaAuthError } from "@/server/meta/graph";
import { describeNumber, linkWaba } from "@/server/bot/whatsapp";
import { EV, inngest } from "@/server/jobs/client";
import { DEFAULT_QUESTIONS, settingsFromRow, type Question } from "@/server/bot/settings";
import type { ActionState } from "../../actions";
import { planLimitMessage } from "@/lib/plans";

const slugSchema = z.string().regex(/^[a-z0-9-]{3,40}$/);

async function adminCtx(form: FormData) {
  const ctx = await requireOrg(slugSchema.parse(form.get("slug")));
  if (!atLeast(ctx.role, "admin")) throw new Error("Only owners and admins can change WhatsApp settings.");
  return ctx;
}

const wabaField = z.union([z.literal(""), z.string().trim().regex(/^\d{6,20}$/, "The WhatsApp Business Account ID is a long number (WhatsApp Manager → Account tools → Account info).")]);

/**
 * Checks the number with Meta, finds the WhatsApp Business Account that owns
 * it and subscribes our app to it (so replies reach us), then stores the
 * token in Vault via connect_whatsapp(). The customer never configures webhooks.
 */
export async function connectWhatsApp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await adminCtx(form);
  const parsed = z
    .object({
      token: z.string().trim().min(20, "That doesn't look like an access token.").max(2000),
      phone_number_id: z.string().trim().regex(/^\d{6,20}$/, "The Phone number ID is the long number under API Setup, not the phone number itself."),
      waba_id: wabaField,
    })
    .safeParse({ token: form.get("token"), phone_number_id: form.get("phone_number_id"), waba_id: String(form.get("waba_id") ?? "").trim() });
  const values = { phone_number_id: String(form.get("phone_number_id") ?? ""), waba_id: String(form.get("waba_id") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };

  let number: Awaited<ReturnType<typeof describeNumber>>;
  let link: Awaited<ReturnType<typeof linkWaba>>;
  try {
    number = await describeNumber(parsed.data.token, parsed.data.phone_number_id);
    link = await linkWaba(parsed.data.token, parsed.data.phone_number_id, parsed.data.waba_id || null);
  } catch (err) {
    if (err instanceof MetaAuthError) return { error: "Meta rejected this token. It needs whatsapp_business_messaging and whatsapp_business_management." };
    if (err instanceof MetaApiError) return { error: `Meta couldn't find that number: ${err.message}` };
    return { error: "Couldn't reach Meta. Try again in a minute." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_whatsapp", {
    p_org: ctx.org.id,
    p_token: parsed.data.token,
    p_phone_number_id: parsed.data.phone_number_id,
    p_display_name: `${number.verified_name} (${number.display_phone_number})`,
    p_available: { display_phone_number: number.display_phone_number, verified_name: number.verified_name, quality_rating: number.quality_rating ?? null, ...link },
  });
  if (error) {
    return {
      error:
        planLimitMessage(error.message, ctx.org.plan) ??
        (error.code === "PGRST202"
          ? "Run supabase/migrations/0005_whatsapp_bot.sql first."
          : error.code === "23505"
            ? "This number is already connected to another workspace."
            : "Couldn't save the connection."),
    };
  }
  revalidatePath(`/o/${ctx.org.slug}/settings`, "layout");
  redirect(`/o/${ctx.org.slug}/settings/whatsapp?connected=1`);
}

/** Retries finding and subscribing the WhatsApp Business Account (a worker does it: the token is in Vault). */
export async function recheckWhatsApp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await adminCtx(form);
  const waba = wabaField.safeParse(String(form.get("waba_id") ?? "").trim());
  if (!waba.success) return { error: waba.error.issues[0]?.message, values: { waba_id: String(form.get("waba_id") ?? "") } };
  try {
    await inngest.send({ name: EV.waLink, data: { orgId: ctx.org.id, wabaId: waba.data || null } });
  } catch {
    return { error: "The background worker isn't reachable. Is the Inngest dev server running?" };
  }
  return { message: "Checking with Meta. Refresh this page in a few seconds." };
}

export async function disconnectWhatsApp(form: FormData): Promise<void> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_whatsapp", { p_org: ctx.org.id });
  if (error) throw new Error("Couldn't disconnect.");
  revalidatePath(`/o/${ctx.org.slug}`, "layout");
  redirect(`/o/${ctx.org.slug}/settings/whatsapp`);
}

const templateName = z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Template names use lowercase letters, numbers and underscores.");

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "option";

/**
 * Rebuilds the questions from the form. Options keep the id, points and
 * synonyms of the option in the same position, so renaming "Call me" keeps
 * its meaning; new lines get new ids. Order matters.
 */
function questionsFromForm(form: FormData, current: Question[]): { questions?: Question[]; error?: string } {
  const out: Question[] = [];
  for (const [i, q] of current.entries()) {
    if (form.get(`q${i}_delete`) === "on" && !["next_step", "call_time"].includes(q.id)) continue;
    const prompt = String(form.get(`q${i}_prompt`) ?? q.prompt).trim();
    const lines = String(form.get(`q${i}_options`) ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!prompt || prompt.length > 300) return { error: `Question ${i + 1}: the question text must be 1–300 characters.` };
    if (lines.length < 2 || lines.length > 10) return { error: `"${prompt}": give between 2 and 10 options, one per line.` };
    const kind = lines.length <= 3 ? "buttons" : "list";
    const max = kind === "buttons" ? 20 : 24;
    const tooLong = lines.find((l) => l.length > max);
    if (tooLong) return { error: `"${tooLong}" is too long. WhatsApp allows ${max} characters for ${kind === "buttons" ? "buttons" : "list options"}.` };
    const used = new Set<string>();
    const options = lines.map((title, j) => {
      const prev = q.options[j];
      let id = prev?.id ?? slugify(title);
      while (used.has(id)) id = `${id}_${j}`;
      used.add(id);
      return prev && prev.title === title ? prev : { ...(prev ?? {}), id, title, synonyms: prev?.title === title ? prev.synonyms : [title.toLowerCase()] };
    });
    out.push({ ...q, prompt, kind, options });
  }
  const added = String(form.get("new_prompt") ?? "").trim();
  if (added) {
    const lines = String(form.get("new_options") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2 || lines.length > 10) return { error: "The new question needs between 2 and 10 options, one per line." };
    const kind = lines.length <= 3 ? "buttons" : "list";
    const max = kind === "buttons" ? 20 : 24;
    if (lines.some((l) => l.length > max)) return { error: `Options for the new question must be at most ${max} characters.` };
    const id = `${slugify(added)}_${out.length}`;
    // New questions go before "next step", so the conversation still ends with the call-to-action.
    const at = Math.max(0, out.findIndex((q) => q.id === "next_step"));
    out.splice(at === -1 ? out.length : at, 0, {
      id,
      label: added.slice(0, 40),
      prompt: added.slice(0, 300),
      kind,
      listButton: "Choose option",
      options: lines.map((title, j) => ({ id: `${slugify(title)}_${j}`, title, synonyms: [title.toLowerCase()] })),
    });
  }
  if (out.length > 12) return { error: "Keep it to 12 questions or fewer; long chats lose leads." };
  return { questions: out };
}

export async function saveBotSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();
  const { data: row } = await supabase.from("bot_settings").select("*").eq("org_id", ctx.org.id).maybeSingle();
  const current = settingsFromRow(row as Record<string, unknown> | null, ctx.org.name);

  const parsed = z
    .object({
      business_name: z.string().trim().min(2, "Enter the name the bot introduces itself with.").max(80),
      welcome: templateName,
      nudge: templateName,
      followup: templateName,
      language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Language code like en or en_US."),
      knowledge: z.string().max(20000, "Keep the facts under 20,000 characters."),
    })
    .safeParse(Object.fromEntries(["business_name", "welcome", "nudge", "followup", "language", "knowledge"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const q = questionsFromForm(form, current.questions);
  if (q.error) return { error: q.error };

  const enabled = form.get("enabled") === "on";
  const { error } = await supabase.from("bot_settings").upsert({
    org_id: ctx.org.id,
    enabled,
    // Turning the bot on starts the clock: older leads are never messaged.
    enabled_at: enabled ? (current.enabled ? current.enabledAt : new Date().toISOString()) : current.enabledAt,
    business_name: parsed.data.business_name,
    templates: { welcome: parsed.data.welcome, nudge: parsed.data.nudge, followup: parsed.data.followup, language: parsed.data.language },
    knowledge: parsed.data.knowledge,
    questions: q.questions,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  });
  if (error) return { error: error.code === "PGRST205" ? "Run migration 0005 first." : "Couldn't save the bot settings." };
  await supabase.rpc("write_audit", {
    p_org: ctx.org.id,
    p_action: "whatsapp.bot_settings_saved",
    p_target: enabled ? "bot on" : "bot off",
    p_meta: { questions: q.questions!.length, turned_on: enabled && !current.enabled },
  });
  revalidatePath(`/o/${ctx.org.slug}/settings/whatsapp`);
  return { message: enabled && !current.enabled ? "Saved. The bot is on; it will message new leads from now on." : "Saved." };
}

export async function resetQuestions(form: FormData): Promise<void> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();
  await supabase.from("bot_settings").upsert({ org_id: ctx.org.id, questions: DEFAULT_QUESTIONS, updated_at: new Date().toISOString(), updated_by: ctx.userId });
  revalidatePath(`/o/${ctx.org.slug}/settings/whatsapp`);
}
