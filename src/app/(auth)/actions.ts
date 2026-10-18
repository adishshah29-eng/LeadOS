"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

export type AuthState = { error?: string; message?: string; email?: string; name?: string };

const credentials = z.object({
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (error) return { error: "Email or password is incorrect.", email };
  redirect(safeNext(form.get("next")));
}

const signUpSchema = credentials.extend({
  name: z.string().trim().min(2, "Enter your name").max(120),
});

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "");
  const parsed = signUpSchema.safeParse({ email, name, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email, name };

  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
    },
  });
  if (error) return { error: error.message, email, name };
  if (data.session) redirect(safeNext(form.get("next")));
  return { message: "Check your inbox to confirm your email, then sign in.", email, name };
}
