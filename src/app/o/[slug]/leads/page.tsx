import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Inbox, Phone } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, decodeCursor, encodeCursor, LEAD_STATUSES, SCORE_META, STATUS_META, type LeadStatus } from "@/lib/leads";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { AddLead } from "./add-lead";
import { AssignSelect, StatusSelect } from "./lead-controls";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 50;

export default async function LeadsPage({ params, searchParams }: PageProps<"/o/[slug]/leads">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  if (ctx.role === "viewer") notFound();

  const status = LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;
  const project = typeof sp.project === "string" && /^[0-9a-f-]{36}$/i.test(sp.project) ? sp.project : undefined;
  const q = cleanSearch(typeof sp.q === "string" ? sp.q : undefined);
  const cursor = decodeCursor(typeof sp.cursor === "string" ? sp.cursor : undefined);

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, name, phone_e164, email, status, score, source, assigned_to, lead_created_at, projects(name)")
    .eq("org_id", ctx.org.id)
    .order("lead_created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (status) query = query.eq("status", status);
  if (project) query = query.eq("project_id", project);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone_e164.ilike.%${q.replace(/\s/g, "")}%`);
  // Keyset pagination: stable and fast at any depth, unlike OFFSET.
  if (cursor) query = query.or(`lead_created_at.lt."${cursor.ts}",and(lead_created_at.eq."${cursor.ts}",id.lt.${cursor.id})`);

  const canManage = atLeast(ctx.role, "manager");
  const [{ data: rows, error }, { data: projects }, { data: members }] = await Promise.all([
    query,
    supabase.from("projects").select("id, name").eq("org_id", ctx.org.id).order("name"),
    canManage
      ? supabase.from("memberships").select("user_id, role, profiles(full_name, email)").eq("org_id", ctx.org.id)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  if (error) throw new Error(error.message);

  const leads = (rows ?? []).slice(0, PAGE_SIZE);
  const last = leads.at(-1);
  const nextCursor = rows && rows.length > PAGE_SIZE && last ? encodeCursor(last.lead_created_at, last.id) : null;
  const assignees = (members ?? []).map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
    return { id: m.user_id as string, name: p?.full_name || p?.email || "Member" };
  });
  const filterQs = new URLSearchParams({ ...(status && { status }), ...(project && { project }), ...(q && { q }) });
  const base = `/o/${ctx.org.slug}/leads`;

  return (
    <>
      <PageHeader
        title="Leads"
        description={ctx.role === "agent" ? "Leads assigned to you." : "Every lead across your projects."}
        actions={
          canManage ? (
            <>
              {atLeast(ctx.role, "admin") ? (
                <a href={`${base}/export?${filterQs}`} className={buttonClass("secondary")} download>
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              ) : null}
              <AddLead slug={ctx.org.slug} projects={projects ?? []} />
            </>
          ) : undefined
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <Input id="q" name="q" placeholder="Search name, phone or email" defaultValue={q} />
        <label htmlFor="status" className="sr-only">Status</label>
        <Select id="status" name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </Select>
        <label htmlFor="project" className="sr-only">Project</label>
        <Select id="project" name="project" defaultValue={project ?? ""}>
          <option value="">All projects</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>

      <Card className="overflow-hidden">
        {leads.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden />}
            title={q || status || project ? "No leads match these filters" : "No leads yet"}
            body={q || status || project ? "Try clearing a filter." : "New leads from Meta forms appear here instantly."}
            action={q || status || project ? <Link href={base} className={buttonClass("secondary", "sm")}>Clear filters</Link> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs font-medium text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Lead</th>
                  <th scope="col" className="px-4 py-2.5">Project</th>
                  <th scope="col" className="px-4 py-2.5">Received</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  {canManage ? <th scope="col" className="px-4 py-2.5">Assigned to</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link href={`${base}/${l.id}`} className="font-medium hover:underline">{l.name ?? "Unnamed lead"}</Link>
                        {l.score ? <Badge tone={SCORE_META[l.score as "hot"].tone}>{SCORE_META[l.score as "hot"].label}</Badge> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                        {l.phone_e164 ? (
                          <a href={`tel:${l.phone_e164}`} className="inline-flex items-center gap-1 hover:text-fg">
                            <Phone className="size-3" aria-hidden /> {l.phone_e164}
                          </a>
                        ) : null}
                        {l.email ? <span>{l.email}</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{(l.projects as unknown as { name: string } | null)?.name ?? "—"}</td>
                    <td className="tabular px-4 py-2.5 text-fg-muted whitespace-nowrap">
                      {new Date(l.lead_created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusSelect slug={ctx.org.slug} leadId={l.id} status={l.status as LeadStatus} />
                    </td>
                    {canManage ? (
                      <td className="px-4 py-2.5">
                        <AssignSelect slug={ctx.org.slug} leadId={l.id} assignedTo={l.assigned_to} people={assignees} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        {cursor ? <Link href={`${base}?${filterQs}`} className={buttonClass("secondary", "sm")}>Back to newest</Link> : null}
        {nextCursor ? (
          <Link href={`${base}?${new URLSearchParams({ ...Object.fromEntries(filterQs), cursor: nextCursor })}`} className={buttonClass("secondary", "sm")}>
            Older leads
          </Link>
        ) : null}
      </div>
    </>
  );
}
