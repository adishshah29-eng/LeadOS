import "server-only";
import { adminDb } from "@/server/supabase-admin";

/**
 * Permanently deletes a user's account (see delete_user_account in 0008).
 * Server-only: call it only after the password and two-factor re-checks.
 */
export async function deleteUserAccount(userId: string) {
  const { error } = await adminDb().rpc("delete_user_account", { p_uid: userId });
  return error;
}
