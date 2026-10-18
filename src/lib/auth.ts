import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "manager" | "agent" | "viewer";

export type OrgContext = {
  org: { id: string; name: string; slug: string; plan: string; status: string; trial_ends_at: string };
  role: OrgRole;
  userId: string;
  email: string;
};

/** The verified signed-in user, or a redirect to /login. Cached per request. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");
  return { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
});

/** Orgs the user belongs to, newest first. */
export const listMyOrgs = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations!inner(id, name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => {
    const o = m.organizations as unknown as { id: string; name: string; slug: string };
    return { ...o, role: m.role as OrgRole };
  });
});

/**
 * Resolves /o/[slug] to an org the user is a member of. A slug the user isn't
 * a member of is a 404 (not 403), so org names can't be probed.
 */
export const requireOrg = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, status, trial_ends_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!org) notFound();
  const { data: m } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) notFound(); // platform staff can see the org row, but not open the workspace
  return { org, role: m.role as OrgRole, userId: user.id, email: user.email };
});

const RANK: Record<OrgRole, number> = { viewer: 0, agent: 1, manager: 2, admin: 3, owner: 4 };

/** UI-side permission check. Hides buttons only — RLS enforces the real rule. */
export function atLeast(role: OrgRole, min: OrgRole) {
  return RANK[role] >= RANK[min];
}

export const isPlatformAdmin = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role as "super_admin" | "support" | undefined;
});
