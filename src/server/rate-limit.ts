import "server-only";
import { headers } from "next/headers";
import { adminDb } from "@/server/supabase-admin";
import { checkLimits, clientIp, type Rule } from "@/lib/rate-limit";

export { LIMIT_RULES } from "@/lib/rate-limit";

const hit = async (key: string, max: number, windowSec: number) => {
  const { data, error } = await adminDb().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSec });
  if (error) throw error;
  return data as number;
};

let warned = false;
export const requestIp = async () => {
  const ip = clientIp(await headers());
  if (ip === "unknown" && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[rate-limit] no client address (x-forwarded-for); per-address limits are skipped");
  }
  return ip;
};

/** Counts this attempt; returns seconds to wait (0 = go ahead). */
export const limitWait = (rules: Rule[]) => checkLimits(rules, hit);
