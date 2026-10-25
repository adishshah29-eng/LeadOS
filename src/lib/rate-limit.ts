import crypto from "node:crypto";
import { isIP } from "node:net";

/**
 * Rate-limit rules and decisions. The counting itself happens in the database
 * (rate_limit_hit, migrations 0011–0012) and is passed in, so this file has no I/O.
 */
export type Rule = { key: string; max: number; windowSec: number };
type Hit = (key: string, max: number, windowSec: number) => Promise<number>;

const UNKNOWN = "unknown";

/** IPv6 counts per /64 (one customer usually controls a whole /64); IPv4-mapped IPv6 becomes IPv4. */
function normaliseIp(raw: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw)?.[1];
  if (mapped && isIP(mapped) === 4) return mapped;
  if (isIP(raw) === 4) return raw;
  if (isIP(raw) !== 6) return UNKNOWN;
  const [head, tail = ""] = raw.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = raw.includes("::") && tail ? tail.split(":") : [];
  const groups = raw.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * The visitor's address. On Vercel, x-forwarded-for is set by the platform
 * and its first value is the real client; anything that isn't a valid IP
 * becomes "unknown".
 */
export function clientIp(h: { get(name: string): string | null }) {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length <= 64 ? normaliseIp(first) : UNKNOWN;
}

/** Keys stay short enough for the database index, however long the input. */
export const safeKey = (key: string) =>
  key.length <= 200 ? key : `${key.slice(0, 100)}:${crypto.createHash("sha256").update(key).digest("hex")}`;

export const formatWait = (seconds: number) => {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
};

/** A counter key for an email, hashed: the table never holds the address. */
export const emailKey = (action: string, email: string) =>
  `${action}:email:${crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;

/**
 * Counts this attempt against the rules in order and stops at the first one
 * that blocks (so a blocked attempt doesn't use up other counters). Returns
 * the wait in seconds, 0 = allowed. If the database errors or takes longer
 * than timeoutMs, the attempt is allowed and logged: a counter outage must not
 * lock everyone out.
 */
export async function checkLimits(rules: Rule[], hit: Hit, opts: { timeoutMs?: number } = {}): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), opts.timeoutMs ?? 1500);
  });
  const run = async () => {
    for (const r of rules) {
      const wait = await hit(safeKey(r.key), r.max, r.windowSec);
      if (wait > 0) return wait;
    }
    return 0;
  };
  try {
    return await Promise.race([run(), timeout]);
  } catch (err) {
    console.error("[rate-limit] check failed, allowing", (err as Error).message);
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

const MIN15 = 900;
const HOUR = 3600;
/** Address-only rules are skipped when the address is unknown: one shared bucket would lock everyone out. */
const perIp = (ip: string, rule: Rule): Rule[] => (ip === UNKNOWN ? [] : [rule]);

/** The approved limits (B4, after review). Address rules come first. */
export const LIMIT_RULES = {
  signIn: (ip: string, email: string): Rule[] => [
    ...perIp(ip, { key: `signin:ip:${ip}`, max: 100, windowSec: MIN15 }),
    { key: `${emailKey("signin", email)}:ip:${ip}`, max: 10, windowSec: MIN15 },
  ],
  signUp: (ip: string): Rule[] => perIp(ip, { key: `signup:ip:${ip}`, max: 20, windowSec: HOUR }),
  passwordReset: (ip: string, email: string): Rule[] => [
    ...perIp(ip, { key: `reset:ip:${ip}`, max: 30, windowSec: HOUR }),
    { key: `${emailKey("reset", email)}:ip:${ip}`, max: 3, windowSec: HOUR },
    { key: emailKey("reset", email), max: 10, windowSec: HOUR },
  ],
  deleteAccount: (userId: string): Rule[] => [{ key: `delete:user:${userId}`, max: 5, windowSec: MIN15 }],
  mfaVerify: (userId: string): Rule[] => [{ key: `mfa:user:${userId}`, max: 5, windowSec: MIN15 }],
  reportLink: (ip: string): Rule[] => perIp(ip, { key: `report:ip:${ip}`, max: 300, windowSec: 60 }),
};
