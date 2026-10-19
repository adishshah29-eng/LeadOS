import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle, Inbox, TrendingUp } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatNum } from "@/lib/utils";
import { STATUS_META, type LeadStatus } from "@/lib/leads";
import { wastedSpend } from "@/lib/performance";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { TrendChart } from "@/components/trend-chart";
import { DashboardFilters } from "@/components/dashboard-filters";
import { RANGES } from "@/lib/ranges";
import { getSetupSteps, setupComplete } from "@/lib/setup-steps";
import { PerformanceTable, type BreakdownRow } from "@/components/performance-table";

export const metadata: Metadata = { title: "Overview" };

type Dashboard = { spend: number; results: number; clicks: number; impressions: number; trend: { date: string; spend: number; results: number }[] };
type Window = { orgId: string; projectId: string | null; from: string; to: string; days: number };

/** Calendar day in India; ad data is stored in the ad account's own day. */
function istDay(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

export default async function Overview({ params, searchParams }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name").eq("org_id", ctx.org.id).order("name");

  const days = Number(RANGES.find((r) => r.value === sp.range)?.value ?? 30);
  const projectId = typeof sp.project === "string" && projects?.some((p) => p.id === sp.project) ? sp.project : null;
  const w: Window = { orgId: ctx.org.id, projectId, from: istDay(-(days - 1)), to: istDay(), days };
  const projectName = projects?.find((p) => p.id === projectId)?.name;
  // Re-render sections when the filters change, instead of showing stale numbers.
  const key = `${days}-${projectId ?? "all"}`;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${projectName ?? "All projects"} · ${w.from} to ${w.to}`}
        actions={<DashboardFilters projects={projects ?? []} />}
      />
      <Suspense fallback={<Card className="mb-6 h-28 animate-pulse" />}>
        <Setup slug={ctx.org.slug} orgId={ctx.org.id} canManage={atLeast(ctx.role, "admin")} />
      </Suspense>
      <Suspense key={`k${key}`} fallback={<KpiSkeleton />}>
        <Kpis w={w} showCrm={ctx.role !== "viewer"} />
      </Suspense>
      <Suspense key={`b${key}`} fallback={<Card className="mt-6 h-72 animate-pulse" />}>
        <Breakdowns w={w} />
      </Suspense>
      {ctx.role !== "viewer" ? (
        <Suspense key={`l${key}`} fallback={<Card className="mt-6 h-64 animate-pulse" />}>
          <RecentLeads slug={ctx.org.slug} w={w} />
        </Suspense>
      ) : null}
    </>
  );
}

/** Getting-started checklist; disappears once the required steps are done. */
async function Setup({ slug, orgId, canManage }: { slug: string; orgId: string; canManage: boolean }) {
  if (!canManage) return null;
  const steps = await getSetupSteps(orgId, slug);
  if (setupComplete(steps)) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-6 p-5" data-tour="setup">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Get set up <span className="text-sm font-normal text-fg-muted">· {done} of {steps.length} done</span></h2>
        <Link href={`/o/${slug}/setup`} className="link text-sm">Open the setup guide</Link>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.id === "project" && !s.done ? `/o/${slug}/setup` : s.href} className="flex h-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-surface-2">
              {s.done ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <Circle className="size-4 shrink-0 text-fg-subtle" aria-hidden />}
              <span className={s.done ? "text-fg-muted line-through" : ""}>{s.title}</span>
              <span className="sr-only">{s.done ? "(done)" : s.optional ? "(optional)" : "(to do)"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Kpis({ w, showCrm }: { w: Window; showCrm: boolean }) {
  const supabase = await createClient();
  let crmQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", w.orgId)
    .gte("lead_created_at", `${w.from}T00:00:00+05:30`)
    .lte("lead_created_at", `${w.to}T23:59:59+05:30`);
  if (w.projectId) crmQuery = crmQuery.eq("project_id", w.projectId);
  const [{ data }, crm] = await Promise.all([
    supabase.rpc("get_dashboard", { p_org: w.orgId, p_project: w.projectId, p_from: w.from, p_to: w.to }),
    showCrm ? crmQuery : Promise.resolve({ count: null }),
  ]);
  const d = (data ?? { spend: 0, results: 0, clicks: 0, impressions: 0, trend: [] }) as Dashboard;
  const spend = Number(d.spend);
  const results = Number(d.results);
  const cpl = results > 0 ? spend / results : null;
  const ctr = d.impressions > 0 ? (Number(d.clicks) / Number(d.impressions)) * 100 : null;

  const tiles = [
    { label: "Spend", value: formatINR(spend) },
    { label: "Leads (Meta)", value: formatNum(results) },
    { label: "Cost per lead", value: cpl === null ? "—" : formatINR(cpl) },
    showCrm ? { label: "Leads in CRM", value: formatNum(crm.count ?? 0) } : { label: "Click-through rate", value: ctr === null ? "—" : `${ctr.toFixed(2)}%` },
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
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Daily spend</h2>
          {ctr !== null ? <span className="tabular text-xs text-fg-subtle">CTR {ctr.toFixed(2)}%</span> : null}
        </div>
        {d.trend.length ? (
          <TrendChart points={d.trend.map((p) => ({ date: p.date, value: Number(p.spend) }))} />
        ) : (
          <EmptyState
            icon={<TrendingUp className="size-5" aria-hidden />}
            title="No ad spend in this period"
            body="Try a longer range. If Meta is connected, check that your ad accounts are linked to a project."
          />
        )}
      </Card>
    </>
  );
}

async function Breakdowns({ w }: { w: Window }) {
  const supabase = await createClient();
  const args = { p_org: w.orgId, p_project: w.projectId, p_from: w.from, p_to: w.to };
  const [{ data: campaigns }, { data: ads }] = await Promise.all([
    supabase.rpc("get_breakdown", { ...args, p_level: "campaign" }),
    supabase.rpc("get_breakdown", { ...args, p_level: "ad" }),
  ]);
  const norm = (rows: unknown): BreakdownRow[] =>
    ((rows ?? []) as BreakdownRow[]).map((r) => ({ ...r, spend: Number(r.spend), results: Number(r.results), impressions: Number(r.impressions), clicks: Number(r.clicks) }));
  const c = norm(campaigns);
  const a = norm(ads);
  if (!c.length) return null;
  const wasted = wastedSpend(a);

  return (
    <>
      {wasted > 0 ? (
        <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <span className="tabular font-semibold">{formatINR(wasted)}</span>{" "}
          <span className="text-fg-muted">went to ads that produced no leads in this period. They&apos;re marked </span>
          <Badge tone="danger">Wasting</Badge>
          <span className="text-fg-muted"> below.</span>
        </p>
      ) : null}
      <Card className="mt-6 overflow-hidden">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Campaigns</h2>
        <PerformanceTable rows={c} entity="Campaign" />
      </Card>
      <Card className="mt-6 overflow-hidden">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Ads</h2>
        <PerformanceTable rows={a} entity="Ad" limit={20} />
      </Card>
    </>
  );
}

async function RecentLeads({ slug, w }: { slug: string; w: Window }) {
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select("id, name, status, lead_created_at, projects(name)")
    .eq("org_id", w.orgId)
    .order("lead_created_at", { ascending: false })
    .limit(6);
  if (w.projectId) q = q.eq("project_id", w.projectId);
  const { data: leads } = await q;
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
            <li key={l.id}>
              <Link href={`/o/${slug}/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.name ?? "Unnamed lead"}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {(l.projects as unknown as { name: string } | null)?.name ?? "No project"} ·{" "}
                    {new Date(l.lead_created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                  </span>
                </span>
                <Badge tone={STATUS_META[l.status as LeadStatus].tone}>{STATUS_META[l.status as LeadStatus].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden />}
          title="No leads yet"
          body="Leads from your Meta forms land here. You can also add one by hand."
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
