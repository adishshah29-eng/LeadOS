import { createClient } from "@/lib/supabase/server";
import { LIMITS, usageLevel, type PlanId } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLAN_LABEL: Record<string, string> = { trial: "Free trial", starter: "Starter", growth: "Growth", agency: "Agency" };

/** What the workspace's plan includes and how much of it is used. */
export async function UsageCard({ orgId, plan }: { orgId: string; plan: string }) {
  const limits = LIMITS[plan as PlanId];
  if (!limits) return null;
  const supabase = await createClient();
  const [accounts, members, invites] = await Promise.all([
    supabase.from("ad_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("sync_enabled", true),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ]);

  const rows = [
    { label: "Ad accounts syncing", used: accounts.count ?? 0, allowed: limits.adAccounts },
    { label: "Team members (incl. pending invites)", used: (members.count ?? 0) + (invites.count ?? 0), allowed: limits.seats },
  ];
  const features = [
    { label: "WhatsApp lead assistant", included: limits.whatsapp },
    { label: "Client report links", included: limits.reportLinks },
  ];

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Plan and usage</h2>
        <Badge>{PLAN_LABEL[plan] ?? plan}</Badge>
      </div>
      <ul className="mt-3 divide-y divide-border text-sm">
        {rows.map((r) => {
          const level = usageLevel(r.used, r.allowed);
          return (
            <li key={r.label} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-fg-muted">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="tabular font-medium">{r.used} / {r.allowed ?? "Unlimited"}</span>
                {level === "full" ? <Badge tone="danger">Limit reached</Badge> : level === "warn" ? <Badge tone="warning">Almost full</Badge> : null}
              </span>
            </li>
          );
        })}
        {features.map((f) => (
          <li key={f.label} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-fg-muted">{f.label}</span>
            {f.included ? <Badge tone="success">Included</Badge> : <Badge>Not on your plan</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
