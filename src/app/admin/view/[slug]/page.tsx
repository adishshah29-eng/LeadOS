import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supportSnapshot } from "@/server/admin";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StartForm } from "./start-form";
import { minutesLeft } from "@/lib/admin";

export const metadata: Metadata = { title: "Support view", robots: { index: false } };

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Read-only support view of one workspace for a super admin. Data appears only
 * while the database confirms an active support session; nothing here can
 * change anything (no forms besides the reason, service-key reads only).
 */
export default async function SupportView({ params }: PageProps<"/admin/view/[slug]">) {
  const { slug } = await params;
  await requirePlatformAdmin(["super_admin"]);
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name, slug, plan, status").eq("slug", slug.toLowerCase()).maybeSingle();
  if (!org) notFound();
  // The database decides: the expiry of my active view of this workspace, or null.
  const { data: expiresAt } = await supabase.rpc("admin_support_session_active", { p_org: org.id });
  const expires = (expiresAt as string | null) ?? null;

  const back = (
    <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden /> Platform admin
    </Link>
  );

  if (!expires) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        {back}
        <PageHeader title={`Support view: ${org.name}`} description="Read-only access for 30 minutes. It's recorded in the customer's activity log with your reason." />
        <Card className="p-5">
          <StartForm slug={org.slug} />
        </Card>
      </main>
    );
  }

  const data = await supportSnapshot(org.id);
  const left = minutesLeft(expires);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      {back}
      <p role="status" className="mb-4 flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
        <Eye className="size-4 shrink-0" aria-hidden /> Support view of {org.name}: read-only, {left} minute{left === 1 ? "" : "s"} left. The customer can see this visit.
      </p>
      <PageHeader title={org.name} description={`${org.plan} · ${org.status} · ${data.projects.length} projects`} />

      <Card className="mb-6 relative overflow-x-auto">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Latest leads ({data.leads.length})</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-2">Name</th>
              <th scope="col" className="px-4 py-2">Phone</th>
              <th scope="col" className="px-4 py-2">Status</th>
              <th scope="col" className="px-4 py-2">Source</th>
              <th scope="col" className="px-4 py-2">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.leads.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2">{l.name ?? "—"}</td>
                <td className="tabular px-4 py-2">{l.phone_e164 ?? "—"}</td>
                <td className="px-4 py-2"><Badge>{l.status}</Badge> {l.score ? <Badge>{l.score}</Badge> : null}</td>
                <td className="px-4 py-2 text-fg-muted">{l.source}</td>
                <td className="tabular px-4 py-2 text-fg-muted">{when(l.lead_created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.leads.length ? <p className="px-5 py-6 text-sm text-fg-muted">No leads.</p> : null}
      </Card>

      <Card>
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">WhatsApp conversations ({data.conversations.length})</h2>
        {data.conversations.length ? (
          <ul className="divide-y divide-border text-sm">
            {data.conversations.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span>
                  <span className="font-medium">{c.name ?? `+${c.phone}`}</span> <span className="text-fg-muted">· {c.state}</span>
                  {c.needs_attention ? <> <Badge tone="warning">Needs a person</Badge></> : null}
                  <span className="block truncate text-xs text-fg-subtle">{c.last_message ?? ""}</span>
                </span>
                <span className="tabular text-xs text-fg-muted">{when(c.updated_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">No conversations.</p>
        )}
      </Card>
    </main>
  );
}
