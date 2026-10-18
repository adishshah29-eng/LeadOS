import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCORE_META, STATUS_META, type LeadStatus } from "@/lib/leads";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addLeadNote } from "../../actions";
import { AssignSelect, StatusSelect } from "../lead-controls";

export const metadata: Metadata = { title: "Lead" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Meta form keys like "what_is_your_budget?" → "What is your budget?" */
const label = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type Event = { id: string; type: string; payload: Record<string, unknown>; created_at: string; actor_id: string | null };

function describe(e: Event, names: Map<string, string>): string {
  switch (e.type) {
    case "created":
      return e.payload.source === "meta" ? "Lead arrived from a Meta form" : "Lead created";
    case "status_changed":
      return `Status changed to ${STATUS_META[e.payload.status as LeadStatus]?.label ?? e.payload.status}`;
    case "assigned":
      return e.payload.assigned_to ? `Assigned to ${names.get(String(e.payload.assigned_to)) ?? "a teammate"}` : "Unassigned";
    case "note":
      return String(e.payload.text ?? "");
    default:
      return e.type;
  }
}

export default async function LeadPage({ params }: PageProps<"/o/[slug]/leads/[id]">) {
  const { slug, id } = await params;
  const ctx = await requireOrg(slug);
  if (ctx.role === "viewer" || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: lead }, { data: events }, { data: members }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, phone_e164, email, status, score, source, assigned_to, lead_created_at, campaign_name, ad_name, form_id, field_data, projects(name)")
      .eq("org_id", ctx.org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("lead_events").select("id, type, payload, created_at, actor_id").eq("org_id", ctx.org.id).eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("memberships").select("user_id, profiles(full_name, email)").eq("org_id", ctx.org.id),
  ]);
  // RLS hides leads this user may not see; treat that the same as "doesn't exist".
  if (!lead) notFound();

  const names = new Map(
    (members ?? []).map((m) => {
      const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
      return [m.user_id as string, p?.full_name || p?.email || "Teammate"];
    }),
  );
  const people = [...names].map(([pid, name]) => ({ id: pid, name }));
  const fields = Object.entries((lead.field_data ?? {}) as Record<string, string>).filter(([, v]) => v);
  const waDigits = lead.phone_e164?.replace(/\D/g, "");
  const base = `/o/${ctx.org.slug}/leads`;

  return (
    <>
      <Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Leads
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{lead.name ?? "Unnamed lead"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{(lead.projects as unknown as { name: string } | null)?.name ?? "No project"}</span>
            <span aria-hidden>·</span>
            <span>{fmt(lead.lead_created_at)}</span>
            <span aria-hidden>·</span>
            <span>{lead.source === "meta" ? "Meta form" : "Added by hand"}</span>
            {lead.score ? <Badge tone={SCORE_META[lead.score as "hot"].tone}>{SCORE_META[lead.score as "hot"].label}</Badge> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone_e164 ? (
            <>
              <a href={`tel:${lead.phone_e164}`} className={buttonClass("primary", "sm")}>
                <Phone className="size-4" aria-hidden /> Call
              </a>
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
            </>
          ) : null}
          {lead.email ? (
            <a href={`mailto:${lead.email}`} className={buttonClass("secondary", "sm")}>
              <Mail className="size-4" aria-hidden /> Email
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-medium">Add a note</h2>
            <ActionForm action={addLeadNote} slug={ctx.org.slug}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <label htmlFor="note" className="sr-only">Note</label>
              <textarea
                id="note"
                name="text"
                rows={3}
                maxLength={2000}
                placeholder="Called, interested in 2BHK, site visit on Saturday…"
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-3 focus:ring-highlight/70"
              />
              <SubmitButton pendingLabel="Saving…" size="sm">Save note</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Timeline</h2>
            {events?.length ? (
              <ol className="divide-y divide-border">
                {(events as Event[]).map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <p className={e.type === "note" ? "whitespace-pre-wrap" : "text-fg-muted"}>{describe(e, names)}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {e.actor_id ? `${names.get(e.actor_id) ?? "Teammate"} · ` : ""}
                      {fmt(e.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-muted">Nothing yet. Notes and status changes show up here.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Status</p>
              <StatusSelect slug={ctx.org.slug} leadId={lead.id} status={lead.status as LeadStatus} />
            </div>
            {atLeast(ctx.role, "manager") ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Assigned to</p>
                <AssignSelect slug={ctx.org.slug} leadId={lead.id} assignedTo={lead.assigned_to} people={people} />
              </div>
            ) : null}
            <dl className="space-y-2 text-sm">
              {lead.phone_e164 ? (<div><dt className="text-xs text-fg-subtle">Phone</dt><dd className="tabular">{lead.phone_e164}</dd></div>) : null}
              {lead.email ? (<div><dt className="text-xs text-fg-subtle">Email</dt><dd className="break-all">{lead.email}</dd></div>) : null}
              {lead.campaign_name ? (<div><dt className="text-xs text-fg-subtle">Campaign</dt><dd>{lead.campaign_name}</dd></div>) : null}
              {lead.ad_name ? (<div><dt className="text-xs text-fg-subtle">Ad</dt><dd>{lead.ad_name}</dd></div>) : null}
            </dl>
          </Card>

          {fields.length ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-medium">Form answers</h2>
              <dl className="space-y-2.5 text-sm">
                {fields.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-fg-subtle">{label(k)}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
