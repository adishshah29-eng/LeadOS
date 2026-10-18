"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { discover, MetaApiError, MetaAuthError } from "@/server/meta/graph";
import { EV, inngest } from "@/server/jobs/client";
import type { ActionState } from "../../actions";

const slugSchema = z.string().regex(/^[a-z0-9-]{3,40}$/);

async function adminCtx(form: FormData) {
  const ctx = await requireOrg(slugSchema.parse(form.get("slug")));
  if (!atLeast(ctx.role, "admin")) throw new Error("Only owners and admins can manage integrations.");
  return ctx;
}

type Available = {
  me: { id: string; name: string };
  adAccounts: { id: string; name: string; currency: string; timezone_name: string; account_status: number }[];
  pages: { id: string; name: string }[];
};

/**
 * Validates a pasted Meta token against the Graph API, then stores it in
 * Vault via connect_meta(). The token is never written anywhere else and is
 * never sent back to the browser.
 */
export async function connectMeta(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await adminCtx(form);
  const token = z.string().trim().min(20, "That doesn't look like an access token.").max(2000).safeParse(form.get("token"));
  if (!token.success) return { error: token.error.issues[0]?.message };

  let found: Awaited<ReturnType<typeof discover>>;
  try {
    found = await discover(token.data);
  } catch (err) {
    if (err instanceof MetaAuthError) return { error: "Meta rejected this token. Check it hasn't expired or been revoked." };
    if (err instanceof MetaApiError) return { error: `Meta returned an error: ${err.message}` };
    return { error: "Couldn't reach Meta. Try again in a minute." };
  }
  if (!found.adAccounts.length) {
    return { error: "This token can't see any ad accounts. Give the System User access to your ad accounts in Business Settings." };
  }

  const available: Available = { me: found.me, adAccounts: found.adAccounts, pages: found.pages };
  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_meta", {
    p_org: ctx.org.id,
    p_token: token.data,
    p_display_name: found.me.name,
    p_scopes: found.scopes,
    p_available: available,
  });
  if (error) return { error: "Couldn't save the connection." };
  revalidatePath(`/o/${ctx.org.slug}/settings`, "layout");
  redirect(`/o/${ctx.org.slug}/settings/meta?connected=1`);
}

/** Saves which ad accounts and Pages to use, then starts their first sync. */
export async function saveMetaSetup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();

  const { data: integ } = await supabase.from("integrations").select("available, status").eq("org_id", ctx.org.id).eq("kind", "meta").maybeSingle();
  if (!integ || integ.status !== "active") return { error: "Connect Meta first." };
  const available = integ.available as Available;

  const { data: projectRows } = await supabase.from("projects").select("id").eq("org_id", ctx.org.id);
  const projectIds = new Set((projectRows ?? []).map((p) => p.id));
  const projectFor = (key: string) => {
    const v = String(form.get(key) ?? "");
    return projectIds.has(v) ? v : null;
  };

  // Only ids that the token actually exposed are accepted.
  const chosenAccounts = new Set(form.getAll("account").map(String));
  const chosenPages = new Set(form.getAll("page").map(String));

  const { data: existingAccounts } = await supabase.from("ad_accounts").select("id, meta_account_id, sync_enabled").eq("org_id", ctx.org.id);
  const wasEnabled = new Map((existingAccounts ?? []).map((a) => [a.meta_account_id, a.sync_enabled]));

  const accountRows = available.adAccounts
    .filter((a) => chosenAccounts.has(a.id) || wasEnabled.has(a.id))
    .map((a) => ({
      org_id: ctx.org.id,
      meta_account_id: a.id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      project_id: projectFor(`project:${a.id}`),
      sync_enabled: chosenAccounts.has(a.id),
    }));
  if (accountRows.length) {
    const { error } = await supabase.from("ad_accounts").upsert(accountRows, { onConflict: "org_id,meta_account_id" });
    if (error) return { error: `Couldn't save ad accounts: ${error.message}` };
  }

  const { data: existingPages } = await supabase.from("meta_pages").select("page_id").eq("org_id", ctx.org.id);
  const hadPage = new Set((existingPages ?? []).map((p) => p.page_id));
  const pageErrors: string[] = [];
  const newPages: string[] = [];
  for (const p of available.pages) {
    if (chosenPages.has(p.id)) {
      const row = { org_id: ctx.org.id, page_id: p.id, name: p.name, project_id: projectFor(`page_project:${p.id}`) };
      const { error } = hadPage.has(p.id)
        ? await supabase.from("meta_pages").update({ project_id: row.project_id, name: p.name }).eq("page_id", p.id).eq("org_id", ctx.org.id)
        : await supabase.from("meta_pages").insert(row);
      if (error) pageErrors.push(error.code === "23505" ? `${p.name} is already connected to another workspace.` : `${p.name}: ${error.message}`);
      else if (!hadPage.has(p.id)) newPages.push(p.id);
    } else if (hadPage.has(p.id)) {
      await supabase.from("meta_pages").delete().eq("page_id", p.id).eq("org_id", ctx.org.id);
    }
  }

  const { data: saved } = await supabase.from("ad_accounts").select("id, meta_account_id, sync_enabled, last_synced_at").eq("org_id", ctx.org.id);
  const events = [
    // First sync backfills 30 days; accounts already syncing just get a refresh.
    ...(saved ?? [])
      .filter((a) => a.sync_enabled)
      .map((a) => ({ name: EV.adsSync, data: { orgId: ctx.org.id, adAccountId: a.id, days: a.last_synced_at ? 2 : 30 } })),
    ...newPages.map((pageId) => ({ name: EV.pageSubscribe, data: { orgId: ctx.org.id, pageId } })),
  ];
  try {
    if (events.length) await inngest.send(events);
  } catch {
    return { error: "Saved, but the background worker isn't reachable, so syncing hasn't started. Is the Inngest dev server running?" };
  }

  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "integration.meta.setup_saved", p_target: `${chosenAccounts.size} accounts, ${chosenPages.size} pages` });
  revalidatePath(`/o/${ctx.org.slug}`, "layout");
  return pageErrors.length
    ? { error: pageErrors.join(" ") }
    : { message: "Saved. The first sync has started. Numbers appear on the overview in a few minutes." };
}

export async function syncNow(form: FormData): Promise<void> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("ad_accounts").select("id").eq("org_id", ctx.org.id).eq("sync_enabled", true);
  const events = [
    ...(accounts ?? []).map((a) => ({ name: EV.adsSync, data: { orgId: ctx.org.id, adAccountId: a.id, days: 7 } })),
    { name: EV.leadsSync, data: { orgId: ctx.org.id, lookbackDays: 7 } },
  ];
  await inngest.send(events);
  await supabase.rpc("write_audit", { p_org: ctx.org.id, p_action: "integration.meta.sync_requested", p_target: `${accounts?.length ?? 0} accounts` });
  revalidatePath(`/o/${ctx.org.slug}/settings/meta`);
}

export async function disconnectMeta(form: FormData): Promise<void> {
  const ctx = await adminCtx(form);
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_meta", { p_org: ctx.org.id });
  if (error) throw new Error("Couldn't disconnect.");
  revalidatePath(`/o/${ctx.org.slug}`, "layout");
  redirect(`/o/${ctx.org.slug}/settings`);
}
