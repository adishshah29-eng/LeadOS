import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowLeft, Eye } from "lucide-react";
import { requirePlatformAdmin, trialLapsed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusForm } from "./status-form";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Platform admin", robots: { index: false } };

/**
 * Platform console. RLS lets platform staff read org metadata and rosters,
 * never leads — support work doesn't need customer PII.
 */
export default async function AdminPage() {
  // Platform staff can see every workspace: require a second factor.
  const { role } = await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, status, trial_ends_at, created_at, memberships(count)")
    .order("created_at", { ascending: false })
    .limit(200);
  // Counts only (admin_usage, 0013): never lead names or numbers.
  const { data: usageRows } = await supabase.rpc("admin_usage");
  type Usage = { org_id: string; ad_accounts_syncing: number; leads_30d: number; wa_messages_30d: number; last_synced_at: string | null; needs_reauth: boolean };
  const usage = new Map(((usageRows ?? []) as Usage[]).map((u) => [u.org_id, u]));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "never");

  const active = orgs?.filter((o) => o.status === "active").length ?? 0;
  const trials = orgs?.filter((o) => o.plan === "trial").length ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Back to app
      </Link>
      <PageHeader
        title="Platform admin"
        description={`Signed in as ${role.replace("_", " ")}.`}
        actions={
          <Link href="/admin/health" className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
            <Activity className="size-4" aria-hidden /> Health
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ["Organizations", orgs?.length ?? 0],
          ["Active", active],
          ["On trial", trials],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-medium text-fg-muted">{label}</p>
            <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5">Organization</th>
              <th scope="col" className="px-4 py-2.5">Plan</th>
              <th scope="col" className="px-4 py-2.5">Members</th>
              <th scope="col" className="px-4 py-2.5">Usage (30 days)</th>
              <th scope="col" className="px-4 py-2.5">Last sync</th>
              <th scope="col" className="px-4 py-2.5">Created</th>
              {role === "super_admin" ? <th scope="col" className="px-4 py-2.5">Plan and access</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(orgs ?? []).map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{o.name}</p>
                  <p className="font-mono text-xs text-fg-subtle">{o.slug}</p>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={o.status === "suspended" ? "danger" : o.plan === "trial" ? "neutral" : "success"}>
                    {o.status === "suspended" ? "Suspended" : o.plan}
                  </Badge>
                  {o.plan === "trial" ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {trialLapsed(o) ? "Ended" : "Ends"} {new Date(o.trial_ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  ) : null}
                </td>
                <td className="tabular px-4 py-2.5">{(o.memberships as unknown as { count: number }[])[0]?.count ?? 0}</td>
                <td className="px-4 py-2.5 text-xs text-fg-muted">
                  {usage.get(o.id) ? (
                    <>
                      <span className="block">{usage.get(o.id)!.ad_accounts_syncing} ad accounts syncing</span>
                      <span className="block">{usage.get(o.id)!.leads_30d} leads · {usage.get(o.id)!.wa_messages_30d} WhatsApp messages</span>
                    </>
                  ) : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <span className="text-fg-muted">{when(usage.get(o.id)?.last_synced_at ?? null)}</span>
                  {usage.get(o.id)?.needs_reauth ? <span className="mt-1 block"><Badge tone="warning">Reconnect needed</Badge></span> : null}
                </td>
                <td className="tabular px-4 py-2.5 text-fg-muted">{new Date(o.created_at).toLocaleDateString("en-IN")}</td>
                {role === "super_admin" ? (
                  <td className="px-4 py-2.5">
                    <div className="space-y-2">
                      <Link href={`/admin/view/${o.slug}`} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg hover:underline">
                        <Eye className="size-3.5" aria-hidden /> Support view
                      </Link>
                      <PlanForm orgId={o.id} orgName={o.name} plan={o.plan} />
                      <StatusForm orgId={o.id} orgName={o.name} suspended={o.status === "suspended"} />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
