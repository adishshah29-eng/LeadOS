/**
 * Paid plans. Prices are the draft from docs/PLATFORM_PLAN.md §9: confirm
 * them with the first customers. Must match the plan values the database
 * allows (0006_billing_guard.sql).
 */
export const PLANS = [
  { id: "starter", name: "Starter", priceInr: 2999, points: ["2 ad accounts", "1 WhatsApp number", "3 team members"] },
  { id: "growth", name: "Growth", priceInr: 7999, points: ["10 ad accounts", "WhatsApp lead assistant", "10 team members"] },
  { id: "agency", name: "Agency", priceInr: 19999, points: ["Unlimited projects", "Client report links", "Unlimited team members"] },
] as const;

export type PlanId = "trial" | (typeof PLANS)[number]["id"];
export const PLAN_IDS: PlanId[] = ["trial", ...PLANS.map((p) => p.id)];
