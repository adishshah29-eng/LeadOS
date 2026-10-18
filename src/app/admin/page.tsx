import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isPlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform admin", robots: { index: false } };

/**
 * Platform console. RLS lets platform staff read org metadata and rosters,
 * never leads — support work doesn't need customer PII.
 */
export default async function AdminPage() {
  const role = await isPlatformAdmin();
  if (!role) notFound();

  const supabase = await createClient();
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

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5">Organization</th>
              <th scope="col" className="px-4 py-2.5">Plan</th>
              <th scope="col" className="px-4 py-2.5">Members</th>
              <th scope="col" className="px-4 py-2.5">Created</th>
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
                </td>
                <td className="tabular px-4 py-2.5">{(o.memberships as unknown as { count: number }[])[0]?.count ?? 0}</td>
                <td className="tabular px-4 py-2.5 text-fg-muted">{new Date(o.created_at).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
