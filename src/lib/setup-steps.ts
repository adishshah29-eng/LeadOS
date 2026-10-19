import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SetupStep = {
  id: "project" | "meta" | "accounts" | "whatsapp" | "team";
  done: boolean;
  optional?: boolean;
  title: string;
  why: string;
  minutes: number;
  href: string;
  action: string;
  guide?: string;
};

/**
 * The getting-started steps for a workspace, in order, with what's done.
 * Shared by the setup page and the checklist on the overview. One query per
 * fact, all in parallel; cached for the request.
 */
export const getSetupSteps = cache(async (orgId: string, slug: string): Promise<SetupStep[]> => {
  const supabase = await createClient();
  const [projects, members, meta, linked, wa] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("kind", "meta").eq("status", "active"),
    supabase.from("ad_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("sync_enabled", true).not("project_id", "is", null),
    supabase.from("integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("kind", "whatsapp").eq("status", "active"),
  ]);
  const base = `/o/${slug}`;
  return [
    {
      id: "project",
      done: (projects.count ?? 0) > 0,
      title: "Add your first project",
      why: "A project is one property, launch or client you advertise. Spend, leads and reports are grouped by project.",
      minutes: 1,
      href: `${base}/projects`,
      action: "Add a project",
    },
    {
      id: "meta",
      done: (meta.count ?? 0) > 0,
      title: "Connect Meta ads",
      why: "So we can read your ad spend and results, and collect leads from your Facebook and Instagram lead forms.",
      minutes: 10,
      href: `${base}/settings/meta`,
      action: "Connect Meta",
      guide: "/help/connect-meta",
    },
    {
      id: "accounts",
      done: (linked.count ?? 0) > 0,
      title: "Pick ad accounts and link them to projects",
      why: "Choose which ad accounts to track and which project each belongs to. The first sync brings in the last 30 days.",
      minutes: 2,
      href: `${base}/settings/meta`,
      action: "Choose accounts",
    },
    {
      id: "whatsapp",
      done: (wa.count ?? 0) > 0,
      optional: true,
      title: "Connect WhatsApp",
      why: "Message every new lead within seconds, ask your qualifying questions, and see who's hot. Needs a WhatsApp Business number.",
      minutes: 15,
      href: `${base}/settings/whatsapp`,
      action: "Set up WhatsApp",
      guide: "/help/connect-whatsapp",
    },
    {
      id: "team",
      done: (members.count ?? 0) > 1,
      optional: true,
      title: "Invite your team",
      why: "Give sales agents only their own leads, managers their projects, and clients a read-only view.",
      minutes: 2,
      href: `${base}/team`,
      action: "Invite people",
      guide: "/help/roles",
    },
  ];
});

/** Required steps left; optional ones don't block "set up". */
export const setupComplete = (steps: SetupStep[]) => steps.every((s) => s.done || s.optional);
