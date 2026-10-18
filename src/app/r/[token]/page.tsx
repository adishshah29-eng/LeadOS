import crypto from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import { formatINR, formatNum } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { TrendChart } from "@/components/trend-chart";
import { PerformanceTable, type BreakdownRow } from "@/components/performance-table";
import { cn } from "@/lib/utils";

// The link's secret is in the URL path: never index it, never send it on as a referrer.
export const metadata: Metadata = { title: "Ad report", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Report = {
  label: string;
  org_name: string;
  project_name: string | null;
  from: string;
  to: string;
  days: number;
  expires_at: string;
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
  trend: { date: string; spend: number; results: number }[];
  campaigns: { name: string; spend: number; results: number; impressions: number; clicks: number }[];
};

/**
 * Read-only client report. No sign-in: the anonymous client calls
 * public_report(), which checks the link and returns totals only.
 */
export default async function SharedReport({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;

  let report: Report | null = null;
  if (/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    const env = requireEnv();
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const { data } = await anon.rpc("public_report", { p_token_hash: hash, p_days: days });
    report = (data as Report | null) ?? null;
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">This report link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-fg-muted">It may have expired or been turned off. Ask whoever shared it for a new link.</p>
        </Card>
      </main>
    );
  }

  const spend = Number(report.spend);
  const results = Number(report.results);
  const cpl = results > 0 ? spend / results : null;
  const ctr = report.impressions > 0 ? (Number(report.clicks) / Number(report.impressions)) * 100 : null;
  const rows: BreakdownRow[] = report.campaigns.map((c, i) => ({
    entity_id: String(i),
    name: c.name,
    parent_name: null,
    spend: Number(c.spend),
    results: Number(c.results),
    impressions: Number(c.impressions),
    clicks: Number(c.clicks),
    active_days: 0,
  }));

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs text-fg-subtle">{report.org_name}</p>
            <h1 className="text-lg font-semibold">{report.project_name ?? report.label}</h1>
          </div>
          <nav aria-label="Date range" className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm", d === days ? "bg-highlight-soft font-medium" : "text-fg-muted hover:bg-surface-2")}
              >
                {d} days
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-fg-muted">{report.from} to {report.to}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Spend", formatINR(spend)],
            ["Leads", formatNum(results)],
            ["Cost per lead", cpl === null ? "—" : formatINR(cpl)],
            ["Click-through rate", ctr === null ? "—" : `${ctr.toFixed(2)}%`],
          ].map(([k, v]) => (
            <Card key={k} className="p-4">
              <p className="text-xs font-medium text-fg-muted">{k}</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{v}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-5">
          <h2 className="mb-4 text-sm font-medium">Daily spend</h2>
          {report.trend.length ? (
            <TrendChart points={report.trend.map((p) => ({ date: p.date, value: Number(p.spend) }))} />
          ) : (
            <p className="text-sm text-fg-muted">No ad spend in this period.</p>
          )}
        </Card>

        {rows.length ? (
          <Card className="mt-6 overflow-hidden">
            <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Campaigns</h2>
            <PerformanceTable rows={rows} entity="Campaign" limit={25} />
          </Card>
        ) : null}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-fg-subtle">
          <span>
            Shared read-only. Link valid until{" "}
            {new Date(report.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}.
          </span>
          <Link href="/" className="flex items-center gap-1.5 hover:text-fg"><Logo className="size-4" /> {BRAND.name}</Link>
        </footer>
      </main>
    </div>
  );
}
