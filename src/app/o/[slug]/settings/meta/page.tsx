import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/brand";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { connectMeta, disconnectMeta, saveMetaSetup, syncNow } from "./actions";

export const metadata: Metadata = { title: "Meta" };

type Available = {
  me?: { id: string; name: string };
  adAccounts?: { id: string; name: string; currency: string; timezone_name: string; account_status: number }[];
  pages?: { id: string; name: string }[];
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "never";

export default async function MetaSettingsPage({ params, searchParams }: PageProps<"/o/[slug]/settings/meta">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) notFound();

  const supabase = await createClient();
  const [{ data: integ }, { data: accounts }, { data: pages }, { data: projects }, { data: runs }] = await Promise.all([
    supabase.from("integrations").select("status, display_name, available, last_error, last_checked_at").eq("org_id", ctx.org.id).eq("kind", "meta").maybeSingle(),
    supabase.from("ad_accounts").select("id, meta_account_id, project_id, sync_enabled, last_synced_at, last_sync_status, last_sync_error").eq("org_id", ctx.org.id),
    supabase.from("meta_pages").select("page_id, project_id, subscribed_at, subscribe_error").eq("org_id", ctx.org.id),
    supabase.from("projects").select("id, name").eq("org_id", ctx.org.id).order("name"),
    supabase.from("sync_runs").select("id, kind, status, started_at, rows_upserted, ad_account_id").eq("org_id", ctx.org.id).order("started_at", { ascending: false }).limit(8),
  ]);

  const connected = integ?.status === "active";
  const available = (integ?.available ?? {}) as Available;
  const accountByMetaId = new Map((accounts ?? []).map((a) => [a.meta_account_id, a]));
  const pageById = new Map((pages ?? []).map((p) => [p.page_id, p]));
  const back = `/o/${ctx.org.slug}/settings`;

  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader
        title="Meta ads & lead forms"
        description={connected ? `Connected as ${integ?.display_name}.` : "Connect your Meta Business account to sync spend and receive leads."}
        actions={
          connected ? (
            <form action={syncNow}>
              <input type="hidden" name="slug" value={ctx.org.slug} />
              <Button type="submit" variant="secondary" size="sm">
                <RefreshCw className="size-4" aria-hidden /> Sync now
              </Button>
            </form>
          ) : undefined
        }
      />

      {integ?.status === "needs_reauth" ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Meta stopped accepting the saved token, so syncing is paused. Paste a new token below to resume. ({integ.last_error})
        </p>
      ) : null}
      {sp.connected ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Connected. Choose the ad accounts and Pages to use below.
        </p>
      ) : null}

      {!connected ? (
        <Card className="mb-6 max-w-2xl p-5">
          <h2 className="font-medium">{integ ? "Reconnect" : "Connect"} with a System User token</h2>
          <ol className="mt-2 mb-4 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>Open Meta Business Settings → Users → System users, and pick (or add) a system user.</li>
            <li>Assign it your ad accounts and Pages.</li>
            <li>
              Generate a token with <code className="font-mono text-xs">ads_read</code>, <code className="font-mono text-xs">leads_retrieval</code>,{" "}
              <code className="font-mono text-xs">pages_show_list</code>, <code className="font-mono text-xs">pages_manage_metadata</code> and{" "}
              <code className="font-mono text-xs">business_management</code>, then paste it here.
            </li>
          </ol>
          <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/help/connect-meta" className="link">Step-by-step guide with every click</Link>
            <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`Setup help for ${ctx.org.name}`)}`} className="link">Or we&apos;ll set it up with you</a>
          </p>
          <ActionForm action={connectMeta} slug={ctx.org.slug}>
            <Field label="Access token" htmlFor="meta-token" hint="Stored encrypted. Nobody, including you, can view it again after saving.">
              <Input id="meta-token" name="token" type="password" autoComplete="off" spellCheck={false} required aria-describedby="meta-token-hint" />
            </Field>
            <SubmitButton pendingLabel="Checking with Meta…">Connect</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      {integ && (available.adAccounts?.length ?? 0) > 0 ? (
        <ActionForm action={saveMetaSetup} slug={ctx.org.slug} className="mb-6">
          <Card>
            <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Ad accounts</h2>
            <ul className="divide-y divide-border">
              {available.adAccounts!.map((a) => {
                const saved = accountByMetaId.get(a.id);
                return (
                  <li key={a.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_220px] sm:items-center">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" name="account" value={a.id} defaultChecked={saved?.sync_enabled ?? false} className="mt-1 size-4 accent-[var(--fg)]" />
                      <span className="min-w-0">
                        <span className="block font-medium">{a.name}</span>
                        <span className="block text-xs text-fg-subtle">
                          {a.id} · {a.currency} · {a.timezone_name}
                          {saved ? ` · last sync ${when(saved.last_synced_at)}` : ""}
                        </span>
                        {saved?.last_sync_status === "failed" ? <span className="mt-1 block text-xs text-danger">Last sync failed: {saved.last_sync_error}</span> : null}
                      </span>
                    </label>
                    <div>
                      <label htmlFor={`project-${a.id}`} className="sr-only">Project for {a.name}</label>
                      <Select id={`project-${a.id}`} name={`project:${a.id}`} defaultValue={saved?.project_id ?? ""}>
                        <option value="">No project</option>
                        {(projects ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="mt-4">
            <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Pages (instant leads)</h2>
            {available.pages?.length ? (
              <ul className="divide-y divide-border">
                {available.pages.map((p) => {
                  const saved = pageById.get(p.id);
                  return (
                    <li key={p.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_220px] sm:items-center">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" name="page" value={p.id} defaultChecked={!!saved} className="mt-1 size-4 accent-[var(--fg)]" />
                        <span className="min-w-0">
                          <span className="block font-medium">{p.name}</span>
                          <span className="block text-xs text-fg-subtle">
                            {saved?.subscribed_at ? "Receiving leads instantly" : saved?.subscribe_error ? `Not subscribed: ${saved.subscribe_error}` : saved ? "Subscribing…" : p.id}
                          </span>
                        </span>
                      </label>
                      <div>
                        <label htmlFor={`page-project-${p.id}`} className="sr-only">Project for {p.name}</label>
                        <Select id={`page-project-${p.id}`} name={`page_project:${p.id}`} defaultValue={saved?.project_id ?? ""}>
                          <option value="">Project from the ad</option>
                          {(projects ?? []).map((pr) => (
                            <option key={pr.id} value={pr.id}>{pr.name}</option>
                          ))}
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-muted">This token can&apos;t see any Pages. Leads still arrive through the scheduled sync.</p>
            )}
          </Card>

          <div className="mt-4">
            <SubmitButton pendingLabel="Saving…">Save and sync</SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {runs?.length ? (
        <Card className="mb-6">
          <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Recent syncs</h2>
          <ul className="divide-y divide-border text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="tabular text-fg-muted">{when(r.started_at)}</span>
                <span className="flex items-center gap-2">
                  {r.rows_upserted !== null ? <span className="tabular text-xs text-fg-subtle">{r.rows_upserted} rows changed</span> : null}
                  <Badge tone={r.status === "ok" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{r.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {integ && integ.status !== "disabled" ? (
        <form action={disconnectMeta}>
          <input type="hidden" name="slug" value={ctx.org.slug} />
          <Button type="submit" variant="danger" size="sm">Disconnect Meta</Button>
        </form>
      ) : null}
    </>
  );
}
