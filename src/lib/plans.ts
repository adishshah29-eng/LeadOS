/**
 * Plans and what each includes. The database enforces the same numbers
 * (public.plan_limits, migration 0009); a test keeps the two identical.
 * Prices are the draft from docs/PLATFORM_PLAN.md §9.
 */
export type PlanId = "trial" | "starter" | "growth" | "agency";
/** null = unlimited */
export type Limits = { adAccounts: number | null; seats: number | null; whatsapp: boolean; reportLinks: boolean };

export const LIMITS: Record<PlanId, Limits> = {
  trial: { adAccounts: 10, seats: 10, whatsapp: true, reportLinks: true },
  starter: { adAccounts: 2, seats: 3, whatsapp: false, reportLinks: false },
  growth: { adAccounts: 10, seats: 10, whatsapp: true, reportLinks: false },
  agency: { adAccounts: null, seats: null, whatsapp: true, reportLinks: true },
};

const NAMES: Record<PlanId, string> = { trial: "The trial", starter: "Starter", growth: "Growth", agency: "Agency" };
const PRICES = { starter: 2999, growth: 7999, agency: 19999 } as const;

function points(l: Limits) {
  return [
    `${l.adAccounts ?? "Unlimited"} ad accounts`,
    `${l.seats ?? "Unlimited"} team members`,
    ...(l.whatsapp ? ["WhatsApp lead assistant"] : []),
    ...(l.reportLinks ? ["Client report links"] : []),
  ];
}

/** Paid plans, for the trial-ended page. */
export const PLANS = (["starter", "growth", "agency"] as const).map((id) => ({ id, name: NAMES[id], priceInr: PRICES[id], points: points(LIMITS[id]) }));

export const PLAN_IDS = Object.keys(LIMITS) as PlanId[];

const limitsOf = (plan: string): Limits | undefined => LIMITS[plan as PlanId];

/** ok below 80%, warn from 80%, full at or over the limit; unlimited is always ok. */
export function usageLevel(used: number, allowed: number | null): "ok" | "warn" | "full" {
  if (allowed === null) return "ok";
  if (used >= allowed) return "full";
  return used >= allowed * 0.8 ? "warn" : "ok";
}

/**
 * Ad-account rows to save, turn-offs first. The database checks the limit row by
 * row, so swapping one syncing account for another at the limit must free the
 * slot before taking it. Returns a new array; order within each group is kept.
 */
export const disablesFirst = <T extends { sync_enabled: boolean }>(rows: T[]): T[] => [
  ...rows.filter((r) => !r.sync_enabled),
  ...rows.filter((r) => r.sync_enabled),
];

export const planIncludesAssistant = (plan: string) => limitsOf(plan)?.whatsapp ?? false;

/** On a plan without WhatsApp (e.g. after a downgrade) the assistant acts as switched off. */
export const settingsForPlan = <T extends { enabled: boolean }>(settings: T, plan: string): T =>
  planIncludesAssistant(plan) ? settings : { ...settings, enabled: false };

/** Turns the database's "plan limit: <what>" error into a message for the user; null for any other error. */
export function planLimitMessage(dbMessage: string, plan: string): string | null {
  const what = /plan limit: (\w+)/.exec(dbMessage)?.[1];
  const l = limitsOf(plan);
  if (!what || !l) return null;
  const name = NAMES[plan as PlanId];
  if (what === "ad_accounts") return `${name} includes ${l.adAccounts} ad accounts. Upgrade to sync more, or turn one off first.`;
  if (what === "seats") return `${name} includes ${l.seats} team members, counting pending invites. Upgrade to add more, or remove someone first.`;
  if (what === "whatsapp") return `WhatsApp isn't included in ${name}. Upgrade to Growth or Agency to connect a number.`;
  if (what === "report_links") return `Client report links aren't included in ${name}. Upgrade to Agency to share reports.`;
  return null;
}
