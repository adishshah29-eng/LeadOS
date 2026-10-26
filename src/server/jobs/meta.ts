import "server-only";
import { z } from "zod";
import { NonRetriableError, RetryAfterError } from "inngest";
import { adminDb } from "@/server/supabase-admin";
import { EV, inngest } from "./client";
import {
  fetchAdInsights,
  fetchAdLeads,
  fetchLeadById,
  MetaAuthError,
  MetaRateLimitError,
  subscribePageToLeads,
} from "@/server/meta/graph";
import { leadRow } from "@/server/meta/lead-fields";

/*
 * Background jobs for Meta. Lanes are separate functions with their own
 * concurrency, so instant leads never wait behind a big ads sync.
 *
 * Tokens are fetched inside the step that uses them and never returned from
 * a step: step results are persisted by Inngest.
 */

const uuid = z.uuid();

async function tokenFor(orgId: string): Promise<string> {
  const { data, error } = await adminDb().rpc("worker_meta_token", { p_org: orgId });
  if (error) throw new Error(`token lookup failed: ${error.message}`);
  if (!data) throw new NonRetriableError("Meta is not connected for this workspace.");
  return data as string;
}

/** Turns Meta failures into the right retry behaviour, recording auth failures on the integration. */
async function handleMetaError(orgId: string, err: unknown): Promise<never> {
  if (err instanceof MetaAuthError) {
    await adminDb()
      .from("integrations")
      .update({ status: "needs_reauth", last_error: err.message.slice(0, 500) } as never)
      .eq("org_id", orgId)
      .eq("kind", "meta");
    throw new NonRetriableError(err.message);
  }
  if (err instanceof MetaRateLimitError) throw new RetryAfterError(err.message, err.retryAfterMs);
  throw err;
}

function todayIn(tz: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Every row of a query: Supabase returns at most 1,000 rows per request. */
async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ------------------------------------------------------------------ ads sync

export const adsSync = inngest.createFunction(
  {
    id: "meta-ads-sync",
    triggers: [{ event: EV.adsSync }],
    // One sync per ad account at a time; at most 8 across the platform.
    concurrency: [{ key: "event.data.adAccountId", limit: 1 }, { limit: 8 }],
    // App-wide token bucket: all tenants share one Meta app's quota.
    throttle: { limit: 120, period: "1m" },
    retries: 4,
  },
  async ({ event, step }) => {
    const data = z.object({ orgId: uuid, adAccountId: uuid, days: z.number().int().min(1).max(90).default(2) }).parse(event.data);
    const db = adminDb();

    const account = await step.run("load-account", async () => {
      const { data: a, error } = await db
        .from("ad_accounts")
        .select("id, org_id, project_id, meta_account_id, timezone, result_action_types, sync_enabled")
        .eq("id", data.adAccountId)
        .eq("org_id", data.orgId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!a) throw new NonRetriableError("Ad account not found.");
      return a as { id: string; org_id: string; project_id: string | null; meta_account_id: string; timezone: string; result_action_types: string[]; sync_enabled: boolean };
    });
    if (!account.sync_enabled) return { skipped: "sync disabled" };

    const until = todayIn(account.timezone);
    const since = todayIn(account.timezone, -(data.days - 1));

    const runId = await step.run("start-run", async () => {
      const { data: r } = await db
        .from("sync_runs")
        .insert({ org_id: data.orgId, ad_account_id: account.id, kind: "ads" } as never)
        .select("id")
        .single();
      return (r as { id: string } | null)?.id ?? null;
    });

    const stored = await step.run("fetch-and-store", async () => {
      try {
        const token = await tokenFor(data.orgId);
        const days = await fetchAdInsights(token, account.meta_account_id, since, until, account.result_action_types);

        const entities = new Map<string, { level: string; entity_id: string; parent_id: string | null; name: string }>();
        for (const d of days) {
          entities.set(`c:${d.campaign_id}`, { level: "campaign", entity_id: d.campaign_id, parent_id: null, name: d.campaign_name });
          entities.set(`s:${d.adset_id}`, { level: "adset", entity_id: d.adset_id, parent_id: d.campaign_id, name: d.adset_name });
          entities.set(`a:${d.ad_id}`, { level: "ad", entity_id: d.ad_id, parent_id: d.adset_id, name: d.ad_name });
        }
        if (entities.size) {
          const { error } = await db.rpc("worker_upsert_ad_entities", { p_org: data.orgId, p_account: account.id, p_rows: [...entities.values()] } as never);
          if (error) throw new Error(error.message);
        }

        let changed = 0;
        for (const batch of chunk(days, 1000)) {
          const rows = batch.map((d) => ({
            date: d.date, ad_id: d.ad_id, adset_id: d.adset_id, campaign_id: d.campaign_id,
            spend: d.spend, impressions: d.impressions, clicks: d.clicks, results: d.results, actions: d.actions,
          }));
          const { data: n, error } = await db.rpc("worker_upsert_ad_daily", { p_org: data.orgId, p_account: account.id, p_rows: rows } as never);
          if (error) throw new Error(error.message);
          changed += (n as number) ?? 0;
        }
        return { rows: days.length, changed };
      } catch (err) {
        await db
          .from("ad_accounts")
          .update({ last_sync_status: "failed", last_sync_error: String((err as Error).message).slice(0, 500) } as never)
          .eq("id", account.id);
        return handleMetaError(data.orgId, err);
      }
    });

    if (account.project_id && stored.changed > 0) {
      await step.run("refresh-rollups", async () => {
        const { error } = await db.rpc("worker_refresh_rollups", { p_org: data.orgId, p_project: account.project_id, p_from: since, p_to: until } as never);
        if (error) throw new Error(error.message);
      });
    }

    await step.run("finish-run", async () => {
      await db
        .from("ad_accounts")
        .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok", last_sync_error: null } as never)
        .eq("id", account.id);
      if (runId) {
        await db
          .from("sync_runs")
          .update({ status: "ok", finished_at: new Date().toISOString(), rows_upserted: stored.changed } as never)
          .eq("id", runId);
      }
    });

    return { since, until, ...stored };
  },
);

// ---------------------------------------------------------------- leads sync

export const leadsSync = inngest.createFunction(
  {
    id: "meta-leads-sync",
    triggers: [{ event: EV.leadsSync }],
    concurrency: [{ key: "event.data.orgId", limit: 1 }, { limit: 4 }],
    throttle: { limit: 60, period: "1m" },
    retries: 3,
  },
  async ({ event, step }) => {
    const data = z.object({ orgId: uuid, lookbackDays: z.number().int().min(1).max(90).default(3) }).parse(event.data);
    const db = adminDb();

    // Ads that delivered during the lookback (at least the last 14 days), with
    // the project each feeds. Leads can arrive a little after an ad stops.
    const ads = await step.run("list-active-ads", async () => {
      const windowDays = Math.max(14, data.lookbackDays + 3);
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
      const rows = await selectAll<{ ad_id: string; ad_accounts: { project_id: string | null; sync_enabled: boolean } }>((from, to) =>
        db
          .from("ad_daily")
          .select("ad_id, ad_accounts!inner(project_id, sync_enabled)")
          .eq("org_id", data.orgId)
          .gte("date", since)
          .gt("impressions", 0)
          .order("date")
          .order("ad_id")
          .range(from, to),
      );
      const map = new Map<string, string | null>();
      for (const r of rows) {
        if (r.ad_accounts.sync_enabled && !map.has(r.ad_id)) map.set(r.ad_id, r.ad_accounts.project_id);
      }
      return [...map].map(([adId, projectId]) => ({ adId, projectId }));
    });

    const sinceUnix = Math.floor(Date.now() / 1000) - data.lookbackDays * 86_400;
    let inserted = 0;
    const newIds: string[] = [];
    // Batches keep each step short and its retry cheap.
    for (const [i, batch] of chunk(ads, 25).entries()) {
      inserted += await step.run(`fetch-leads-${i}`, async () => {
        try {
          const token = await tokenFor(data.orgId);
          const rows = [];
          for (const ad of batch) {
            const leads = await fetchAdLeads(token, ad.adId, sinceUnix);
            rows.push(...leads.map((l) => leadRow(l, { project_id: ad.projectId })));
          }
          if (!rows.length) return [] as string[];
          const { data: ids, error } = await db.rpc("worker_ingest_meta_leads", { p_org: data.orgId, p_rows: rows } as never);
          if (error) throw new Error(error.message);
          return (ids as string[] | null) ?? [];
        } catch (err) {
          return handleMetaError(data.orgId, err);
        }
      }).then((ids) => {
        newIds.push(...ids);
        return ids.length;
      });
    }
    // New leads get the WhatsApp welcome (the bot itself skips anything older than 24h).
    if (newIds.length) {
      await step.sendEvent("start-whatsapp", newIds.map((leadId) => ({ name: EV.waLeadStart, data: { orgId: data.orgId, leadId } })));
    }
    return { ads: ads.length, inserted };
  },
);

// ------------------------------------------------------- instant lead (webhook)

export const leadReceived = inngest.createFunction(
  {
    id: "meta-lead-received",
    triggers: [{ event: EV.leadReceived }],
    // Its own lane: never queued behind syncs. Per-org cap keeps one tenant's burst fair.
    concurrency: [{ key: "event.data.orgId", limit: 5 }],
    retries: 6,
  },
  async ({ event, step }) => {
    const { webhookEventId } = z.object({ webhookEventId: uuid, orgId: z.string().optional() }).parse(event.data);
    const db = adminDb();

    const result = await step.run("ingest", async () => {
      const { data: ev, error } = await db
        .from("webhook_events")
        .select("id, org_id, payload, processed_at, attempts")
        .eq("id", webhookEventId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = ev as { id: string; org_id: string | null; payload: { leadgen_id: string; page_id: string; ad_id?: string }; processed_at: string | null; attempts: number } | null;
      if (!row || row.processed_at) return { created: [] as string[], orgId: null };

      const markProcessed = (lastError: string | null) =>
        db.from("webhook_events").update({ processed_at: new Date().toISOString(), last_error: lastError } as never).eq("id", row.id);

      if (!row.org_id) {
        await markProcessed("No workspace owns this Page.");
        return { created: [] as string[], orgId: null };
      }

      try {
        const token = await tokenFor(row.org_id);
        const lead = await fetchLeadById(token, row.payload.leadgen_id);

        // Project: the Page's project, else the project of the ad's account.
        const { data: page } = await db.from("meta_pages").select("project_id").eq("page_id", row.payload.page_id).maybeSingle();
        let projectId = (page as { project_id: string | null } | null)?.project_id ?? null;
        if (!projectId && lead.ad_id) {
          const { data: ent } = await db
            .from("ad_entities")
            .select("ad_accounts!inner(project_id)")
            .eq("org_id", row.org_id)
            .eq("level", "ad")
            .eq("entity_id", lead.ad_id)
            .maybeSingle();
          projectId = (ent as unknown as { ad_accounts: { project_id: string | null } } | null)?.ad_accounts.project_id ?? null;
        }

        const { data: ids, error: ingestError } = await db.rpc("worker_ingest_meta_leads", {
          p_org: row.org_id,
          p_rows: [leadRow(lead, { project_id: projectId, page_id: row.payload.page_id })],
        } as never);
        if (ingestError) throw new Error(ingestError.message);
        await markProcessed(null);
        return { created: (ids as string[] | null) ?? [], orgId: row.org_id };
      } catch (err) {
        await db
          .from("webhook_events")
          .update({ attempts: row.attempts + 1, last_error: String((err as Error).message).slice(0, 500) } as never)
          .eq("id", row.id);
        return handleMetaError(row.org_id, err);
      }
    });
    // Outside the step: a failed send retries here instead of being skipped as "already processed".
    if (result.created.length) {
      await step.sendEvent("start-whatsapp", result.created.map((leadId) => ({ id: `wa-start-${leadId}`, name: EV.waLeadStart, data: { orgId: result.orgId!, leadId } })));
    }
    return { inserted: result.created.length };
  },
);

// ------------------------------------------------------------- page subscribe

export const pageSubscribe = inngest.createFunction(
  { id: "meta-page-subscribe", triggers: [{ event: EV.pageSubscribe }], retries: 3 },
  async ({ event, step }) => {
    const data = z.object({ orgId: uuid, pageId: z.string().regex(/^\d+$/) }).parse(event.data);
    return step.run("subscribe", async () => {
      const db = adminDb();
      try {
        await subscribePageToLeads(await tokenFor(data.orgId), data.pageId);
        await db.from("meta_pages").update({ subscribed_at: new Date().toISOString(), subscribe_error: null } as never).eq("page_id", data.pageId).eq("org_id", data.orgId);
        return { subscribed: true };
      } catch (err) {
        await db.from("meta_pages").update({ subscribe_error: String((err as Error).message).slice(0, 500) } as never).eq("page_id", data.pageId).eq("org_id", data.orgId);
        return handleMetaError(data.orgId, err);
      }
    });
  },
);

// ------------------------------------------------------------ rollup rebuild

/**
 * Re-adds up every project's dashboard numbers from the stored ad days. Needed
 * when an ad account is linked to a project, moved or unlinked: the ad numbers
 * didn't change, so a normal sync wouldn't rebuild anything.
 */
export const rollupsRebuild = inngest.createFunction(
  { id: "meta-rollups-rebuild", triggers: [{ event: EV.rollupsRebuild }], concurrency: [{ key: "event.data.orgId", limit: 1 }], retries: 3 },
  async ({ event, step }) => {
    const { orgId } = z.object({ orgId: uuid }).parse(event.data);
    return step.run("rebuild", async () => {
      const db = adminDb();
      const { data: projects, error } = await db.from("projects").select("id").eq("org_id", orgId);
      if (error) throw new Error(error.message);
      const to = todayIn("Asia/Kolkata", 1);
      for (const p of (projects ?? []) as { id: string }[]) {
        const { error: e } = await db.rpc("worker_refresh_rollups", { p_org: orgId, p_project: p.id, p_from: "2000-01-01", p_to: to } as never);
        if (e) throw new Error(e.message);
      }
      return { projects: projects?.length ?? 0 };
    });
  },
);

// ----------------------------------------------------------------- schedules

/** Fans out syncs: hourly for the last 2 days, twice a day for the trailing 7 plus a leads sweep. */
export const scheduleSyncs = inngest.createFunction(
  {
    id: "meta-schedule-syncs",
    triggers: [{ cron: "TZ=Asia/Kolkata 5 * * * *" }, { cron: "TZ=Asia/Kolkata 40 2,14 * * *" }],
  },
  async ({ event, step }) => {
    const deep = "cron" in (event.data ?? {}) && String((event.data as { cron?: string }).cron).includes("2,14");
    const accounts = await step.run("list-accounts", async () => {
      const db = adminDb();
      const [ints, accounts] = await Promise.all([
        selectAll<{ org_id: string }>((from, to) => db.from("integrations").select("org_id").eq("kind", "meta").eq("status", "active").order("org_id").range(from, to)),
        selectAll<{ id: string; org_id: string }>((from, to) => db.from("ad_accounts").select("id, org_id").eq("sync_enabled", true).order("id").range(from, to)),
      ]);
      const active = new Set(ints.map((i) => i.org_id));
      return accounts.filter((a) => active.has(a.org_id)).map((a) => ({ id: a.id, orgId: a.org_id }));
    });
    if (!accounts.length) return { accounts: 0 };

    await step.sendEvent(
      "fan-out-ads",
      accounts.map((a) => ({ name: EV.adsSync, data: { orgId: a.orgId, adAccountId: a.id, days: deep ? 7 : 2 } })),
    );
    const orgs = [...new Set(accounts.map((a) => a.orgId))];
    await step.sendEvent(
      "fan-out-leads",
      orgs.map((orgId) => ({ name: EV.leadsSync, data: { orgId, lookbackDays: deep ? 7 : 2 } })),
    );
    return { accounts: accounts.length, orgs: orgs.length, deep };
  },
);

/** Re-queues webhook events that were stored but never processed (queue outage, crash). */
export const sweepWebhooks = inngest.createFunction(
  { id: "meta-sweep-webhooks", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const stale = await step.run("find-stale", async () => {
      const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data, error } = await adminDb()
        .from("webhook_events")
        .select("id, kind, org_id, attempts, from:payload->>from")
        .is("processed_at", null)
        .lt("received_at", cutoff)
        .lt("attempts", 8)
        .order("received_at")
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; kind: string; org_id: string | null; attempts: number; from: string | null }[];
    });
    if (stale.length) {
      await step.sendEvent(
        "requeue",
        stale.map((e) => ({
          id: `wh-${e.id}-retry-${e.attempts}`,
          name: e.kind === "wa.message" ? EV.waInbound : EV.leadReceived,
          // The real sender keeps a swept message in that phone's one-at-a-time lane.
          data: { webhookEventId: e.id, orgId: e.org_id ?? "none", from: e.from ?? "sweep" },
        })),
      );
    }
    return { requeued: stale.length };
  },
);

/** Hourly clean-up: rate-limit counters whose window ended, and expired support views. */
export const pruneRateLimits = inngest.createFunction(
  { id: "rate-limits-prune", triggers: [{ cron: "17 * * * *" }] },
  async ({ step }) => {
    const counters = await step.run("prune-rate-limits", async () => {
      const { data, error } = await adminDb().rpc("rate_limit_prune");
      if (error) throw new Error(error.message);
      return data as number;
    });
    const sessions = await step.run("prune-support-sessions", async () => {
      const { data, error } = await adminDb().rpc("admin_prune_support_sessions");
      if (error) throw new Error(error.message);
      return data as number;
    });
    return { counters, sessions };
  },
);

export const functions = [adsSync, leadsSync, leadReceived, pageSubscribe, rollupsRebuild, scheduleSyncs, sweepWebhooks, pruneRateLimits];
