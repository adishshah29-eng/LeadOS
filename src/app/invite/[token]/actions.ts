"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  await requireUser();
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { error: "This invitation link is not valid." };
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token_hash: tokenHash });
  if (error) {
    return {
      error: error.message.includes("different email")
        ? "This invitation was sent to a different email. Sign in with that address."
        : "This invitation is invalid, expired, or already used. Ask an admin for a new one.",
    };
  }
  redirect(`/o/${slug as string}`);
}
