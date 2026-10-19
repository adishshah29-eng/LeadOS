"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CreateOrgState = { error?: string; name?: string; slug?: string };

const RESERVED = new Set(["admin", "api", "app", "auth", "login", "signup", "settings", "new", "www"]);

const schema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Use 3–40 lowercase letters, numbers or dashes")
    .refine((s) => !RESERVED.has(s), "That address is reserved"),
});

export async function createOrganization(_prev: CreateOrgState, form: FormData): Promise<CreateOrgState> {
  await requireUser();
  const raw = { name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? "") };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, ...raw };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) {
    // 23505 = unique violation on the slug.
    const msg = error.code === "23505" ? "That address is taken. Try another." : error.message.includes("limit") ? "You've reached the limit of 5 workspaces." : "Couldn't create the workspace. Try again.";
    return { error: msg, ...raw };
  }
  // New workspaces start on the setup guide.
  redirect(`/o/${parsed.data.slug}/setup`);
}
