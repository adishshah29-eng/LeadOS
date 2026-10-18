import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle, Inbox, TrendingUp } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatNum } from "@/lib/utils";
import { STATUS_META, type LeadStatus } from "@/lib/leads";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { TrendChart } from "@/components/trend-chart";

export const metadata: Metadata = { title: "Overview" };

type Dashboard = { spend: number; results: number; clicks: number; impressions: number; trend: { date: string; spend: number; results: number }[] };

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function Overview({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  return (
    <>
      <PageHeader title="Overview" description="Last 30 days across your projects." />
      <Suspense fallback={<SetupSkeleton />}>
        <Setup slug={ctx.org.slug} orgId={ctx.org.id} canManage={atLeast(ctx.role, "admin")} />
      </Suspense>
      <Suspense fallback={<KpiSkeleton />}>
        <Kpis orgId={ctx.org.id} />
      </Suspense>
      {ctx.role !== "viewer" ? (
        <Suspense fallback={<Card className="mt-6 h-64 animate-pulse" />}>
          <RecentLeads slug={ctx.org.slug} orgId={ctx.org.id} />
        </Suspense>
      ) : null}
    </>
  );
}

/** Getting-started checklist; disappears once everything is done. */
async function Setup({ slug, orgId, canManage }: { slug: string; orgId: string; canManage: boolean }) {
  if (!canManage) return null;
  const supabase = await createClient();
  const [projects, members, meta] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("kind", "meta").eq("status", "active"),
  ]);
  const steps = [
    { done: (projects.count ?? 0) > 0, label: "Create your first project", href: `/o/${slug}/projects` },
    { done: (members.count ?? 0) > 1, label: "Invite your team", href: `/o/${slug}/team` },
    { done: (meta.count ?? 0) > 0, label: "Connect Meta ads", href: `/o/${slug}/settings` },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="mb-6 p-5">
      <h2 className="font-medium">Get set up</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-surface-2">
              {s.done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-fg-subtle" aria-hidden />}
              <span className={s.done ? "text-fg-muted line-through" : ""}>{s.label}</span>
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Kpis({ orgId }: { orgId: string }) {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_dashboard", { p_org: orgId, p_project: null, p_from: isoDay(from), p_to: isoDay(to) });
  const d = (data ?? { spend: 0, results: 0, clicks: 0, impressions: 0, trend: [] }) as Dashboard;
  const cpl = d.results > 0 ? d.spend / d.results : null;
  const ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : null;

  const tiles = [
    { label: "Spend", value: formatINR(Number(d.spend)) },
    { label: "Leads from ads", value: formatNum(Number(d.results)) },
    { label: "Cost per lead", value: cpl === null ? "—" : formatINR(cpl) },
    { label: "Click-through rate", value: ctr === null ? "—" : `${ctr.toFixed(2)}%` },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-medium text-fg-muted">{t.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{t.value}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-medium">Daily spend</h2>
        {d.trend.length ? (
          <TrendChart points={d.trend.map((p) => ({ date: p.date, value: Number(p.spend) }))} />
        ) : (
          <EmptyState
            icon={<TrendingUp className="size-5" aria-hidden />}
            title="No ad data yet"
            body="Once Meta is connected, spend and leads appear here after the first sync."
          />
        )}
      </Card>
    </>
  );
}

async function RecentLeads({ slug, orgId }: { slug: string; orgId: string }) {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, status, lead_created_at, projects(name)")
    .eq("org_id", orgId)
    .order("lead_created_at", { ascending: false })
    .limit(6);
  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">Latest leads</h2>
        <Link href={`/o/${slug}/leads`} className="link text-sm">
          View all
        </Link>
      </div>
      {leads?.length ? (
        <ul className="divide-y divide-border">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.name ?? "Unnamed lead"}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {(l.projects as unknown as { name: string } | null)?.name ?? "No project"} ·{" "}
                  {new Date(l.lead_created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
              </div>
              <Badge tone={STATUS_META[l.status as LeadStatus].tone}>{STATUS_META[l.status as LeadStatus].label}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden />}
          title="No leads yet"
          body="Leads from your Meta forms land here instantly. You can also add one by hand."
          action={<Link href={`/o/${slug}/leads`} className={buttonClass("secondary", "sm")}>Go to leads</Link>}
        />
      )}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading numbers">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="h-[76px] animate-pulse" />
      ))}
    </div>
  );
}

function SetupSkeleton() {
  return <Card className="mb-6 h-28 animate-pulse" />;
}
