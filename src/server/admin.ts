import "server-only";
import { adminDb } from "@/server/supabase-admin";

/**
 * Read-only data for a super admin's support view. Callers must first confirm
 * an active support session with admin_support_session_active() (the database
 * is the authority); these reads use the service key and never write.
 */
export async function supportSnapshot(orgId: string) {
  const db = adminDb();
  const [leads, conversations, projects] = await Promise.all([
    db.from("leads").select("id, name, phone_e164, status, score, source, lead_created_at").eq("org_id", orgId).order("lead_created_at", { ascending: false }).limit(50),
    db.from("wa_conversations").select("id, name, phone, state, last_message, needs_attention, updated_at").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(30),
    db.from("projects").select("id, name").eq("org_id", orgId).order("name"),
  ]);
  return {
    leads: (leads.data ?? []) as { id: string; name: string | null; phone_e164: string | null; status: string; score: string | null; source: string; lead_created_at: string }[],
    conversations: (conversations.data ?? []) as { id: string; name: string | null; phone: string; state: string; last_message: string | null; needs_attention: boolean; updated_at: string }[],
    projects: (projects.data ?? []) as { id: string; name: string }[],
  };
}
