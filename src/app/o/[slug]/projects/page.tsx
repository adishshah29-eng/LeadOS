import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/field";
import { createProject } from "../actions";

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
                <li key={p.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular text-sm text-fg-muted">
                    {accounts} ad account{accounts === 1 ? "" : "s"} · {leads} lead{leads === 1 ? "" : "s"}
                  </span>
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
