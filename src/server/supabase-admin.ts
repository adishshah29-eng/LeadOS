import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for background jobs and the Meta webhook ONLY.
 * It bypasses Row-Level Security, so every query here must filter by org_id
 * explicitly. ESLint blocks importing this file from app pages and actions.
 */
let client: SupabaseClient | null = null;

export function adminDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY is not set (needed by background jobs).");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
