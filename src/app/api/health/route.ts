import { adminDb } from "@/server/supabase-admin";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

/** GET /api/health — for uptime monitors. No sign-in; answers only ok / not ok. */
export async function GET() {
  const { status, body } = await checkHealth(async (signal) => {
    const { error } = await adminDb().from("organizations").select("id", { head: true }).limit(1).abortSignal(signal);
    if (error) throw error;
  });
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
