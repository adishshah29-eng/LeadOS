"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { requireEnv } from "@/lib/env";
import { emailMatches } from "@/lib/deletion";
import { passwordIsValid } from "@/lib/verify-password";
import { deleteUserAccount } from "@/server/account";
import { formatWait } from "@/lib/rate-limit";
import { LIMIT_RULES, limitWait } from "@/server/rate-limit";

export type AccountState = { error?: string; message?: string };

export async function updateProfile(_prev: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const name = z.string().trim().min(2, "Enter your name").max(120).safeParse(form.get("full_name"));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name.data }).eq("user_id", user.id);
  if (error) return { error: "Couldn't save your name." };
  revalidatePath("/account");
  return { message: "Saved." };
}

export async function changePassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  await requireUser();
  const pw = z.string().min(10, "Use at least 10 characters").max(128).safeParse(form.get("password"));
  if (!pw.success) return { error: pw.error.issues[0]?.message };
  if (form.get("password") !== form.get("confirm")) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) {
    return {
      error: /reauth|recent/i.test(error.message)
        ? "For security, sign out and back in, then change your password within a few minutes."
        : error.message,
    };
  }
  return { message: "Password changed." };
}

// ------------------------------------------------------------- two-factor

export type EnrollState = AccountState & { factorId?: string; qr?: string; secret?: string };

/** Starts authenticator-app setup. Any half-finished setup is removed first. */
export async function startTwoFactor(): Promise<EnrollState> {
  await requireUser();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: error?.message ?? "Couldn't start setup." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTwoFactor(_prev: EnrollState, form: FormData): Promise<EnrollState> {
  await requireUser();
  const factorId = z.uuid().safeParse(form.get("factor_id"));
  const code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app.").safeParse(String(form.get("code") ?? "").replace(/\s/g, ""));
  if (!factorId.success) return { error: "Setup expired. Start again." };
  if (!code.success) return { error: code.error.issues[0]?.message, factorId: factorId.data, qr: String(form.get("qr") ?? ""), secret: String(form.get("secret") ?? "") };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: code.data });
  if (error) {
    return { error: "That code didn't match. Codes change every 30 seconds; try the current one.", factorId: factorId.data, qr: String(form.get("qr") ?? ""), secret: String(form.get("secret") ?? "") };
  }
  revalidatePath("/account");
  return { message: "Two-factor login is on." };
}

export async function removeTwoFactor(form: FormData): Promise<void> {
  await requireUser();
  const factorId = z.uuid().parse(form.get("factor_id"));
  const supabase = await createClient();
  // Supabase only allows this from a session that already passed the second factor.
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) redirect("/account?mfa=reverify");
  revalidatePath("/account");
}

/** Second step of sign-in for users with two-factor login. */
export async function verifyLoginCode(_prev: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  // A 6-digit code is guessable without a limit; Supabase sees every check as coming from this server.
  const wait = await limitWait(LIMIT_RULES.mfaVerify(user.id));
  if (wait) return { error: `Too many attempts. Try again in ${formatWait(wait)}.` };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) redirect("/app");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "That code didn't match. Try the current one." };
  redirect(safeNext(form.get("next")));
}

/**
 * Permanently deletes the signed-in user's account. Needs their email typed,
 * their password re-entered and, if they use two-factor login, a session that
 * passed it. Only then is the server-only delete called. The database refuses
 * while they own a workspace that has other members or is suspended, and
 * deletes workspaces they own alone.
 */
export async function deleteAccount(_prev: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  if (!emailMatches(String(form.get("confirm_email") ?? ""), user.email)) return { error: "Type your email address exactly as shown." };
  const wait = await limitWait(LIMIT_RULES.deleteAccount(user.id));
  if (wait) return { error: `Too many attempts. Try again in ${formatWait(wait)}.` };
  const env = requireEnv();
  const ok = await passwordIsValid(user.email, String(form.get("password") ?? ""), user.id, {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!ok) return { error: "That password is incorrect." };

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { error: "Sign out and back in with your two-factor code, then try again." };

  const error = await deleteUserAccount(user.id);
  if (error) {
    const owned = /owns workspace with members: (.+)/.exec(error.message)?.[1];
    const suspended = /owns suspended workspace: ([^;]+)/.exec(error.message)?.[1];
    return {
      error: owned
        ? `You own "${owned}", which has other members. Remove them or delete that workspace first.`
        : suspended
          ? `"${suspended}" is suspended, so it can't be deleted. Contact support.`
          : "Couldn't delete your account. Nothing was removed.",
    };
  }
  // The user no longer exists; clear this browser's cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/?account=deleted");
}
