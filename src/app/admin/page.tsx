import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isPlatformAdmin, trialLapsed } from "@/lib/auth";
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
  const role = await isPlatformAdmin();
  if (!role) notFound();

  // Platform staff can see every workspace: require a second factor.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.aal !== "aal2") redirect("/account?mfa=required");

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, status, trial_ends_at, created_at, memberships(count)")
    .order("created_at", { ascending: false })
    .limit(200);

  const active = orgs?.filter((o) => o.status === "active").length ?? 0;
  const trials = orgs?.filter((o) => o.plan === "trial").length ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Back to app
      </Link>
      <PageHeader title="Platform admin" description={`Signed in as ${role.replace("_", " ")}.`} />

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
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5">Organization</th>
              <th scope="col" className="px-4 py-2.5">Plan</th>
              <th scope="col" className="px-4 py-2.5">Members</th>
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
                <td className="tabular px-4 py-2.5 text-fg-muted">{new Date(o.created_at).toLocaleDateString("en-IN")}</td>
                {role === "super_admin" ? (
                  <td className="px-4 py-2.5">
                    <div className="space-y-2">
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
