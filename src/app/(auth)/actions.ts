"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { formatWait } from "@/lib/rate-limit";
import { LIMIT_RULES, limitWait, requestIp } from "@/server/rate-limit";

export type AuthState = { error?: string; message?: string; email?: string; name?: string };

const credentials = z.object({
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  // Supabase sees every sign-in as coming from this server, so its own limits are shared by all users.
  const wait = await limitWait(LIMIT_RULES.signIn(await requestIp(), parsed.data.email));
  if (wait) return { error: `Too many attempts. Try again in ${formatWait(wait)}.`, email };

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

  const wait = await limitWait(LIMIT_RULES.signUp(await requestIp()));
  if (wait) return { error: `Too many attempts. Try again in ${formatWait(wait)}.`, email, name };

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

/**
 * Sends a password-reset email. The reply is the same whether or not the
 * account exists, so this can't be used to find out who has an account.
 */
export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = z.email("Enter a valid email").max(254).safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  // Counted per email whether or not an account exists, so this reveals nothing.
  const wait = await limitWait(LIMIT_RULES.passwordReset(await requestIp(), parsed.data));
  if (wait) return { error: `Too many reset emails requested. Try again in ${formatWait(wait)}.`, email };

  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get("origin") || "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  // Rate limits are the only error worth showing; anything else would leak whether the account exists.
  if (error && /rate|too many/i.test(error.message)) return { error: "Too many reset emails. Wait a few minutes and try again.", email };
  return {
    message: "If an account exists for that email, a reset link is on its way. Open it in this same browser; it expires in an hour.",
    email,
  };
}

/** Sets a new password for the signed-in user (the reset link signs them in first). */
export async function setNewPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const pw = credentials.shape.password.safeParse(form.get("password"));
  if (!pw.success) return { error: pw.error.issues[0]?.message };
  if (form.get("password") !== form.get("confirm")) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "This reset link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) {
    return {
      error: /same|different/i.test(error.message)
        ? "Choose a password you haven't used for this account before."
        : /weak|pwned|leaked/i.test(error.message)
          ? "That password is too easy to guess or has appeared in a data breach. Choose another."
          : "Couldn't change the password. Ask for a new reset link and try again.",
    };
  }
  // Other devices keep their sessions until they expire; signing them out is in Account.
  redirect("/app");
}
