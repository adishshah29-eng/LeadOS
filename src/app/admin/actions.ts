"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supportReason } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { PLAN_IDS, type PlanId } from "@/lib/plans";

export type AdminState = { error?: string; message?: string };

/** Suspend or reactivate a workspace. The database re-checks super_admin + two-factor and logs it. */
export async function setOrgStatus(_prev: AdminState, form: FormData): Promise<AdminState> {
  if ((await isPlatformAdmin()) !== "super_admin") return { error: "Only super admins can do this." };
  const parsed = z
    .object({
      org_id: z.uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().trim().min(3, "Give a short reason; it goes in the workspace's activity log.").max(300),
    })
    .safeParse({ org_id: form.get("org_id"), status: form.get("status"), reason: form.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_org_status", {
    p_org: parsed.data.org_id,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: error.message.includes("two-factor") ? "Sign in with your two-factor code first." : "Couldn't change the status." };
  revalidatePath("/admin");
  return { message: parsed.data.status === "suspended" ? "Workspace suspended." : "Workspace reactivated." };
}

/** Change a workspace's plan, or extend its trial. The database re-checks super_admin + two-factor and logs it. */
export async function setOrgPlan(_prev: AdminState, form: FormData): Promise<AdminState> {
  if ((await isPlatformAdmin()) !== "super_admin") return { error: "Only super admins can do this." };
  const parsed = z
    .object({
      org_id: z.uuid(),
      plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]),
      trial_days: z.union([z.literal(""), z.coerce.number().int().min(1).max(90)]),
      reason: z.string().trim().min(3, "Give a short reason; it goes in the workspace's activity log.").max(300),
    })
    .safeParse({ org_id: form.get("org_id"), plan: form.get("plan"), trial_days: String(form.get("trial_days") ?? ""), reason: form.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const days = parsed.data.trial_days === "" ? null : parsed.data.trial_days;
  if (parsed.data.plan === "trial" && !days) return { error: "Say how many trial days to add." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", {
    p_org: parsed.data.org_id,
    p_plan: parsed.data.plan,
    p_trial_days: parsed.data.plan === "trial" ? days : null,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return {
      error: error.message.includes("two-factor")
        ? "Sign in with your two-factor code first."
        : error.code === "PGRST202"
          ? "Run supabase/migrations/0006_billing_guard.sql first."
          : "Couldn't change the plan.",
    };
  }
  revalidatePath("/admin");
  return { message: parsed.data.plan === "trial" ? `Trial extended by ${days} days.` : `Plan set to ${parsed.data.plan}.` };
}

export type SupportState = { error?: string };

/** Super admin opens a workspace read-only for 30 minutes; the database checks role, two-factor and the reason, and logs it. */
export async function startSupportView(_prev: SupportState, form: FormData): Promise<SupportState> {
  await requirePlatformAdmin(["super_admin"]);
  const slug = z.string().regex(/^[a-z0-9-]{3,40}$/).safeParse(form.get("slug"));
  const reason = supportReason(String(form.get("reason") ?? ""));
  if (!slug.success) return { error: "Unknown workspace." };
  if (!reason.ok) return { error: "Give a reason of 3–300 characters with real words. The customer will see it in their activity log." };
  const supabase = await createClient();
  // The workspace is looked up from its address here, never taken from the form, so the log and the view always match.
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug.data).maybeSingle();
  if (!org) return { error: "Unknown workspace." };
  const { error } = await supabase.rpc("admin_start_support_session", { p_org: org.id, p_reason: reason.reason });
  if (error) return { error: /two-factor/.test(error.message) ? "Sign in with your two-factor code first." : "Couldn't start the support view." };
  redirect(`/admin/view/${slug.data}`);
}
