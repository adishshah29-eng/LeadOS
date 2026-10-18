import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, FolderKanban } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/field";
import { createProject, setProjectAccess } from "../actions";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: PageProps<"/o/[slug]/projects">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, created_at, ad_accounts(count), leads(count)")
    .eq("org_id", ctx.org.id)
    .order("name");
  const canEdit = atLeast(ctx.role, "admin");

  // Managers and viewers only see projects they're given; owners/admins see all.
  const [{ data: scoped }, { data: grants }] = canEdit
    ? await Promise.all([
        supabase.from("memberships").select("user_id, role, profiles(full_name, email)").eq("org_id", ctx.org.id).in("role", ["manager", "viewer"]),
        supabase.from("project_members").select("project_id, user_id").eq("org_id", ctx.org.id),
      ])
    : [{ data: [] }, { data: [] }];
  const people = (scoped ?? []).map((m) => {
    const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
    return { id: m.user_id as string, role: m.role as string, name: p?.full_name || p?.email || "Member" };
  });
  const access = new Map<string, Set<string>>();
  for (const g of grants ?? []) {
    if (!access.has(g.project_id)) access.set(g.project_id, new Set());
    access.get(g.project_id)!.add(g.user_id);
  }

  return (
    <>
      <PageHeader title="Projects" description="A project is one property or campaign you report on, like a building or a client." />
      {canEdit ? (
        <Card className="mb-6 p-4">
          <ActionForm action={createProject} slug={ctx.org.slug}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="project-name" className="sr-only">Project name</label>
              <Input id="project-name" name="name" placeholder="e.g. Skyline Residences" required />
              <SubmitButton pendingLabel="Adding…" className="shrink-0">Add project</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <Card>
        {projects?.length ? (
          <ul className="divide-y divide-border">
            {projects.map((p) => {
              const accounts = (p.ad_accounts as unknown as { count: number }[])[0]?.count ?? 0;
              const leads = (p.leads as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/o/${ctx.org.slug}?project=${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className="tabular text-sm text-fg-muted">
                      {accounts} ad account{accounts === 1 ? "" : "s"} · {leads} lead{leads === 1 ? "" : "s"}
                      {canEdit ? ` · ${access.get(p.id)?.size ?? 0} with access` : ""}
                    </span>
                  </div>
                  {canEdit ? (
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-fg-muted hover:text-fg">
                        Who can see this project <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      {people.length ? (
                        <ActionForm action={setProjectAccess} slug={ctx.org.slug} className="mt-3 rounded-md border border-border p-3">
                          <input type="hidden" name="project_id" value={p.id} />
                          <fieldset>
                            <legend className="mb-2 text-xs text-fg-subtle">Owners and admins always see every project.</legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {people.map((person) => (
                                <label key={person.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                  <input type="checkbox" name="user_id" value={person.id} defaultChecked={access.get(p.id)?.has(person.id) ?? false} className="size-4 accent-[var(--fg)]" />
                                  <span>{person.name}</span>
                                  <span className="text-xs text-fg-subtle capitalize">{person.role}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <SubmitButton pendingLabel="Saving…" size="sm">Save access</SubmitButton>
                        </ActionForm>
                      ) : (
                        <p className="mt-2 text-sm text-fg-muted">
                          No managers or viewers yet. <Link href={`/o/${ctx.org.slug}/team`} className="link">Invite one</Link> to share specific projects.
                        </p>
                      )}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<FolderKanban className="size-5" aria-hidden />}
            title="No projects yet"
            body={canEdit ? "Add your first project above. Ad accounts and leads are grouped by project." : "An admin hasn't shared any projects with you yet."}
          />
        )}
      </Card>
    </>
  );
}
