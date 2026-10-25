import { createClient } from "@supabase/supabase-js";

/**
 * Re-checks a signed-in user's password before something irreversible.
 * Uses a separate, unsaved session so the browser's own session is untouched,
 * and only signs that temporary session out ("local": the default "global"
 * would sign the user out everywhere).
 */
export async function passwordIsValid(email: string, password: string, expectedUserId: string, cfg: { url: string; key: string }) {
  if (!password || !email) return false;
  const client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (data.session) await client.auth.signOut({ scope: "local" });
  return !error && data.user?.id === expectedUserId;
}
