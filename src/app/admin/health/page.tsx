import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageText, maskError } from "@/lib/admin";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Platform health", robots: { index: false } };

type Health = {
  sync_failures: { org_id: string; name: string; failures_24h: number; latest_error: string | null }[];
  oldest_webhook_seconds: number | null;
  dead_webhooks: number;
  needs_reauth: { org_id: string; name: string; kind: string; last_error: string | null }[];
  blocked: { kind: string; keys: number }[];
};

/** What's broken right now, across all workspaces (admin_health, 0013). */
export default async function HealthPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_health");
  const h = (data ?? { sync_failures: [], oldest_webhook_seconds: null, dead_webhooks: 0, needs_reauth: [], blocked: [] }) as Health;
  const backlog = h.oldest_webhook_seconds;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Platform admin
      </Link>
      <PageHeader title="Health" description="Problems to fix before customers notice them." />
      {error ? <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Couldn&apos;t load health: {error.message}</p> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-fg-muted">Oldest unprocessed webhook</p>
          <p className="mt-1 text-2xl font-semibold">{backlog === null ? "None waiting" : ageText(backlog)}</p>
          {backlog !== null && backlog > 600 ? <Badge tone="warning">Stuck: check the job runner</Badge> : null}
          {h.dead_webhooks ? <p className="mt-1 text-xs text-fg-muted">{h.dead_webhooks} given up after 8 tries</p> : null}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-fg-muted">Workspaces with failing syncs</p>
          <p className="tabular mt-1 text-2xl font-semibold">{h.sync_failures.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-fg-muted">Connections needing reconnection</p>
          <p className="tabular mt-1 text-2xl font-semibold">{h.needs_reauth.length}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Failing syncs (last 24 hours)</h2>
        {h.sync_failures.length ? (
          <ul className="divide-y divide-border text-sm">
            {h.sync_failures.map((f) => (
              <li key={f.org_id} className="px-5 py-3">
                <span className="font-medium">{f.name}</span> <span className="text-fg-muted">· {f.failures_24h} failed runs</span>
                {f.latest_error ? <p className="mt-1 font-mono text-xs break-all text-fg-subtle">{maskError(f.latest_error)}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">All syncs are healthy.</p>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Reconnect needed</h2>
        {h.needs_reauth.length ? (
          <ul className="divide-y divide-border text-sm">
            {h.needs_reauth.map((r) => (
              <li key={`${r.org_id}-${r.kind}`} className="px-5 py-3">
                <span className="font-medium">{r.name}</span> <Badge>{r.kind}</Badge>
                {r.last_error ? <p className="mt-1 font-mono text-xs break-all text-fg-subtle">{maskError(r.last_error)}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">Every connection is working.</p>
        )}
      </Card>

      <Card>
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Blocked right now (rate limits, by type)</h2>
        {h.blocked.length ? (
          <ul className="divide-y divide-border text-sm">
            {h.blocked.map((b) => (
              <li key={b.kind} className="flex justify-between gap-3 px-5 py-2.5">
                <code className="font-mono text-xs">{b.kind}</code>
                <span className="tabular shrink-0">{b.keys} blocked</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">Nothing is blocked right now.</p>
        )}
      </Card>
    </main>
  );
}
