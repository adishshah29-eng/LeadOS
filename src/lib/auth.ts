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

/**
 * The database rejected the session (expired or invalid JWT). Happens when a
 * refresh was missed, e.g. the device clock is far off, so the client thinks
 * the token is still fresh. Sign in again instead of showing an error page.
 */
function bounceIfSessionRejected(error: { code?: string; message?: string } | null) {
  if (error && (error.code === "PGRST301" || error.code === "PGRST303" || /JWT expired/i.test(error.message ?? ""))) {
    redirect("/login?error=session");
  }
}

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
    .select("role, organizations!inner(id, name, slug, status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  bounceIfSessionRejected(error);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => {
    const o = m.organizations as unknown as { id: string; name: string; slug: string; status: string };
    return { ...o, role: m.role as OrgRole };
  });
});

/** The free trial ended and no paid plan has started. */
export function trialLapsed(org: { plan: string; trial_ends_at: string }, now = Date.now()) {
  return org.plan === "trial" && Date.parse(org.trial_ends_at) <= now;
}

/** Whole days left in the trial. Rounded, not ceil'd: seconds of clock skew must not show "15 days" on a 14-day trial. */
export function trialDaysLeft(org: { trial_ends_at: string }, now = Date.now()) {
  return Math.max(0, Math.round((Date.parse(org.trial_ends_at) - now) / 86_400_000));
}

/**
 * Resolves /o/[slug] to an org the user is a member of. A slug the user isn't
 * a member of is a 404 (not 403), so org names can't be probed.
 *
 * A workspace whose trial lapsed is sent to its trial-ended page, which
 * blocks every page and server action that calls this. Pass
 * `{ allowLapsed: true }` only where a paused workspace must still work:
 * the layout, the trial-ended page and the CSV export.
 */
export async function requireOrg(slug: string, opts?: { allowLapsed?: boolean }): Promise<OrgContext> {
  const ctx = await loadOrg(slug);
  if (!opts?.allowLapsed && trialLapsed(ctx.org)) redirect(`/o/${ctx.org.slug}/trial-ended`);
  return ctx;
}

const loadOrg = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, status, trial_ends_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  bounceIfSessionRejected(error);
  if (!org) notFound();
  const { data: m } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) notFound(); // platform staff can see the org row, but not open the workspace
  if (org.status === "suspended") redirect("/suspended");
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

/**
 * Platform admin pages: a platform admin (optionally only these roles) signed in
 * with two-factor. Anyone else gets a 404; an admin without 2FA is sent to set it up.
 */
export async function requirePlatformAdmin(roles: ("super_admin" | "support")[] = ["super_admin", "support"]) {
  const role = await isPlatformAdmin();
  if (!role || !roles.includes(role)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.aal !== "aal2") redirect("/account?mfa=required");
  const user = await requireUser();
  return { role, userId: user.id };
}
