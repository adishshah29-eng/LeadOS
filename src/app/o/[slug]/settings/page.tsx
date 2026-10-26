import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, MessageCircle } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createReportLink, renameOrg, revokeReportLink } from "../actions";
import { DangerZone } from "@/components/danger-zone";
import { UsageCard } from "@/components/usage-card";

export const metadata: Metadata = { title: "Settings" };

const INTEGRATIONS = [
  { kind: "meta", Icon: BarChart3, name: "Meta ads & lead forms", body: "Sync spend and results, and receive leads the moment a form is submitted." },
  { kind: "whatsapp", Icon: MessageCircle, name: "WhatsApp Business", body: "Send an instant welcome, qualify leads with buttons, and follow up automatically." },
] as const;

export default async function SettingsPage({ params }: PageProps<"/o/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) notFound();

  const supabase = await createClient();
  const [{ data: integrations }, { data: audit }, { data: visits }, { data: links }, { data: projects }] = await Promise.all([
    supabase.from("integrations").select("kind, status").eq("org_id", ctx.org.id),
    supabase.from("audit_log").select("id, action, target, at, actor_id").eq("org_id", ctx.org.id).order("at", { ascending: false }).limit(20),
    // Kept apart so everyday activity never pushes support visits out of view.
    supabase.from("audit_log").select("id, target, at").eq("org_id", ctx.org.id).eq("action", "support.viewed").order("at", { ascending: false }).limit(20),
    supabase
      .from("report_links")
      .select("id, label, expires_at, last_viewed_at, view_count, projects(name)")
      .eq("org_id", ctx.org.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ]);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const statusOf = (kind: string) => integrations?.find((i) => i.kind === kind)?.status;

  return (
    <>
      <PageHeader title="Settings" />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-medium">Workspace</h2>
        <ActionForm action={renameOrg} slug={ctx.org.slug} className="max-w-md">
          <Field label="Company name" htmlFor="org-name">
            <Input id="org-name" name="name" required defaultValue={ctx.org.name} />
          </Field>
          <p className="text-xs text-fg-subtle">
            Address: <code className="font-mono">/o/{ctx.org.slug}</code>
          </p>
          <SubmitButton pendingLabel="Saving…" size="sm">Save</SubmitButton>
        </ActionForm>
      </Card>

      <UsageCard orgId={ctx.org.id} plan={ctx.org.plan} />

      <h2 className="mb-3 font-medium">Integrations</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        {INTEGRATIONS.map(({ kind, Icon, name, body }) => {
          const status = statusOf(kind);
          return (
            <Card key={kind} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Icon className="size-5 text-fg" aria-hidden />
                {status === "active" ? <Badge tone="success">Connected</Badge> : status === "needs_reauth" ? <Badge tone="warning">Reconnect needed</Badge> : <Badge>Not connected</Badge>}
              </div>
              <h3 className="mt-3 font-medium">{name}</h3>
              <p className="mt-1 flex-1 text-sm text-fg-muted">{body}</p>
              <Link href={`/o/${ctx.org.slug}/settings/${kind}`} className={buttonClass("secondary", "sm", "mt-4 self-start")}>
                {status === "active" ? "Manage" : status === "needs_reauth" ? "Reconnect" : "Connect"}
              </Link>
            </Card>
          );
        })}
      </div>

      <Card className="mb-6 p-5">
        <h2 className="font-medium">Client report links</h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">
          A read-only dashboard you can send a client: spend, leads and campaigns, never lead names or phone numbers. No account needed to open it.
        </p>
        <ActionForm action={createReportLink} slug={ctx.org.slug}>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_140px_auto] sm:items-end">
            <Field label="Name" htmlFor="link-label">
              <Input id="link-label" name="label" placeholder="e.g. Skyline client weekly" required maxLength={80} />
            </Field>
            <Field label="Project" htmlFor="link-project">
              <Select id="link-project" name="project_id" defaultValue="">
                <option value="">All projects</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expires in" htmlFor="link-expires">
              <Select id="link-expires" name="expires" defaultValue="30">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </Select>
            </Field>
            <SubmitButton pendingLabel="Creating…">Create link</SubmitButton>
          </div>
        </ActionForm>
        {links?.length ? (
          <ul className="mt-5 divide-y divide-border border-t border-border text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{l.label}</span>
                  <span className="block text-xs text-fg-subtle">
                    {(l.projects as unknown as { name: string } | null)?.name ?? "All projects"} · expires {shortDate(l.expires_at)} ·{" "}
                    {l.view_count ? `viewed ${l.view_count}×, last ${shortDate(l.last_viewed_at!)}` : "not opened yet"}
                  </span>
                </span>
                <form action={revokeReportLink}>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="link_id" value={l.id} />
                  <Button type="submit" variant="ghost" size="sm">Turn off</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="mb-6">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Support visits</h2>
        {visits?.length ? (
          <ul className="divide-y divide-border text-sm">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-col gap-0.5 px-5 py-2.5 sm:flex-row sm:justify-between">
                <span>
                  LeadOS support viewed your workspace <span className="text-fg-muted">— {v.target}</span>
                </span>
                <span className="tabular text-xs text-fg-subtle">
                  {new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">LeadOS support has not opened your workspace.</p>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Activity log</h2>
        {audit?.length ? (
          <ul className="divide-y divide-border text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-5 py-2.5 sm:flex-row sm:justify-between">
                <span>
                  {a.action === "support.viewed" ? "LeadOS support" : <code className="font-mono text-xs">{a.action}</code>} <span className="text-fg-muted">{a.target}</span>
                </span>
                <span className="tabular text-xs text-fg-subtle">
                  {new Date(a.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">No activity yet.</p>
        )}
      </Card>

      {ctx.role === "owner" ? <DangerZone slug={ctx.org.slug} name={ctx.org.name} /> : null}
    </>
  );
}
