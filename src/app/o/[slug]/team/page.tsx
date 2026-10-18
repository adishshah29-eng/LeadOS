import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { atLeast, requireOrg, type OrgRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { inviteMember, removeMember, revokeInvite } from "../actions";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = { title: "Team" };

const ROLE_INFO: Record<OrgRole, string> = {
  owner: "Everything, including billing and deleting the workspace.",
  admin: "Integrations, team, settings and all projects.",
  manager: "Dashboards and leads for their assigned projects. Can assign leads.",
  agent: "Only the leads assigned to them.",
  viewer: "Read-only dashboards for their projects. No lead contact details.",
};

export default async function TeamPage({ params }: PageProps<"/o/[slug]/team">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) notFound();

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, created_at, profiles(full_name, email)").eq("org_id", ctx.org.id).order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("org_id", ctx.org.id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="Team" description="Who can open this workspace, and what they can do." />

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-medium">Invite someone</h2>
        <ActionForm action={inviteMember} slug={ctx.org.slug}>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Field label="Email" htmlFor="invite-email">
                <Input id="invite-email" name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="invite-role">
                <Select id="invite-role" name="role" defaultValue="agent">
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                </Select>
              </Field>
              <SubmitButton pendingLabel="Creating…">Create invite link</SubmitButton>
          </div>
        </ActionForm>
        <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {(Object.keys(ROLE_INFO) as OrgRole[]).map((r) => (
            <div key={r} className="flex gap-2">
              <dt className="w-16 shrink-0 font-medium capitalize">{r}</dt>
              <dd className="text-fg-muted">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Members</h2>
        <ul className="divide-y divide-border">
          {(members ?? []).map((m) => {
            const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
            const isOwner = m.role === "owner";
            const isMe = m.user_id === ctx.userId;
            return (
              <li key={m.user_id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p?.full_name || p?.email} {isMe ? <span className="text-fg-subtle">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-fg-subtle">{p?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner || isMe ? (
                    <Badge tone="neutral">{m.role}</Badge>
                  ) : (
                    <>
                      <RoleSelect slug={ctx.org.slug} userId={m.user_id} role={m.role as OrgRole} />
                      <form action={removeMember}>
                        <input type="hidden" name="slug" value={ctx.org.slug} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <Button variant="danger" size="sm" type="submit">Remove</Button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {invites?.length ? (
        <Card className="mt-6">
          <h2 className="border-b border-border px-5 py-3 text-sm font-medium">Pending invitations</h2>
          <ul className="divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{i.email}</p>
                  <p className="text-xs text-fg-subtle">
                    {i.role} · expires {new Date(i.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <form action={revokeInvite}>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="invite_id" value={i.id} />
                  <Button variant="ghost" size="sm" type="submit">Revoke</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
