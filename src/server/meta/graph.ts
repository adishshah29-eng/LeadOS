import "server-only";

/**
 * Meta Graph API client, one token per workspace.
 *
 * Ported from meta-crm's lib/meta.ts (its Ads-Manager-matching rules are kept:
 * unified attribution, link clicks, deleted/archived ads included, result =
 * first non-zero action type from a priority list), plus:
 *  - usage headers are read on every response; above USAGE_PARK_PCT the call
 *    throws MetaRateLimitError so the job backs off instead of getting the
 *    whole app throttled;
 *  - auth failures (code 190 / 102) throw MetaAuthError so the workspace is
 *    marked "reconnect needed" instead of retrying forever.
 */

const API_VERSION = process.env.META_API_VERSION || "v23.0";
export const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const USAGE_PARK_PCT = 75;

export class MetaApiError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message);
    this.name = "MetaApiError";
  }
}
export class MetaAuthError extends MetaApiError {
  name = "MetaAuthError";
}
export class MetaRateLimitError extends MetaApiError {
  name = "MetaRateLimitError";
  constructor(message: string, public retryAfterMs: number) {
    super(message);
  }
}

const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type UsageEntry = { call_count?: number; total_cputime?: number; total_time?: number; estimated_time_to_regain_access?: number };

/** Highest usage % across Meta's app, ad-account and business-use-case headers. */
export function readUsage(headers: Headers): { pct: number; regainMs: number } {
  let pct = 0;
  let regainMs = 0;
  const parse = (h: string | null) => {
    if (!h) return null;
    try {
      return JSON.parse(h);
    } catch {
      return null;
    }
  };
  const app = parse(headers.get("x-app-usage")) as UsageEntry | null;
  if (app) pct = Math.max(pct, app.call_count ?? 0, app.total_cputime ?? 0, app.total_time ?? 0);
  const acc = parse(headers.get("x-ad-account-usage")) as { acc_id_util_pct?: number; reset_time_duration?: number } | null;
  if (acc) {
    pct = Math.max(pct, acc.acc_id_util_pct ?? 0);
    regainMs = Math.max(regainMs, (acc.reset_time_duration ?? 0) * 1000);
  }
  const buc = parse(headers.get("x-business-use-case-usage")) as Record<string, UsageEntry[]> | null;
  if (buc) {
    for (const list of Object.values(buc)) {
      for (const e of list ?? []) {
        pct = Math.max(pct, e.call_count ?? 0, e.total_cputime ?? 0, e.total_time ?? 0);
        regainMs = Math.max(regainMs, (e.estimated_time_to_regain_access ?? 0) * 60_000);
      }
    }
  }
  return { pct, regainMs };
}

/** GET with retries for transient errors. Throws typed errors for auth and rate limits. */
export async function graphGet<T>(url: string, token: string, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      lastError = err; // network error or timeout → retry
      continue;
    }
    const usage = readUsage(res.headers);
    const json = (await res.json().catch(() => null)) as { error?: { code: number; error_subcode?: number; message: string; is_transient?: boolean } } | null;

    if (json?.error) {
      const { code, message } = json.error;
      if (code === 190 || code === 102 || json.error.error_subcode === 463) {
        throw new MetaAuthError(`Meta token rejected (${code}): ${message}`, code, res.status);
      }
      if (RATE_LIMIT_CODES.has(code)) {
        throw new MetaRateLimitError(`Meta rate limit (${code}): ${message}`, Math.max(usage.regainMs, 5 * 60_000));
      }
      lastError = new MetaApiError(`Meta API error ${code}: ${message}`, code, res.status);
      if (RETRYABLE_CODES.has(code) || json.error.is_transient || res.status >= 500) continue;
      throw lastError;
    }
    if (!res.ok || !json) {
      lastError = new MetaApiError(`Meta API HTTP ${res.status}`, undefined, res.status);
      if (res.status >= 500 || res.status === 429) continue;
      throw lastError;
    }
    // Park before Meta starts throttling the whole app.
    if (usage.pct >= USAGE_PARK_PCT) {
      throw new MetaRateLimitError(`Meta usage at ${usage.pct}%`, Math.max(usage.regainMs, 10 * 60_000));
    }
    return json as T;
  }
  throw lastError instanceof Error ? lastError : new MetaApiError("Meta API request failed");
}

export async function graphPost<T>(url: string, token: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => null)) as { error?: { code: number; message: string } } | null;
  if (json?.error) {
    if (json.error.code === 190) throw new MetaAuthError(`Meta token rejected: ${json.error.message}`, 190, res.status);
    throw new MetaApiError(`Meta API error ${json.error.code}: ${json.error.message}`, json.error.code, res.status);
  }
  return json as T;
}

async function graphAll<T>(url: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const page: { data?: T[]; paging?: { next?: string } } = await graphGet(next, token);
    out.push(...(page.data ?? []));
    next = page.paging?.next;
  }
  return out;
}

// --------------------------------------------------------------- discovery

export type MetaIdentity = { id: string; name: string };
export type MetaAdAccount = { id: string; name: string; currency: string; timezone_name: string; account_status: number };
export type MetaPage = { id: string; name: string };

/** What a pasted token can see. Used when connecting and for the picker. */
export async function discover(token: string) {
  const me = await graphGet<MetaIdentity>(`${GRAPH}/me?fields=id,name`, token);
  const [adAccounts, pages, perms] = await Promise.all([
    graphAll<MetaAdAccount>(`${GRAPH}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=200`, token),
    graphAll<MetaPage>(`${GRAPH}/me/accounts?fields=id,name&limit=200`, token).catch(() => [] as MetaPage[]),
    graphAll<{ permission: string; status: string }>(`${GRAPH}/me/permissions?limit=200`, token).catch(() => []),
  ]);
  return {
    me,
    adAccounts,
    pages,
    scopes: perms.filter((p) => p.status === "granted").map((p) => p.permission),
  };
}

// ---------------------------------------------------------------- insights

const DEFAULT_RESULT_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
];

type RawAction = { action_type: string; value: string };
type RawInsight = {
  date_start: string;
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: RawAction[];
};

export type AdDay = {
  date: string;
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  actions: RawAction[];
};

function pickResults(actions: RawAction[] | undefined, types: string[]) {
  for (const type of types) {
    const n = Number(actions?.find((a) => a.action_type === type)?.value ?? 0);
    if (n > 0) return Math.round(n);
  }
  return 0;
}

const ALL_AD_STATUSES = [
  "ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "PENDING_REVIEW",
  "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "IN_PROCESS", "WITH_ISSUES",
];

/** Daily ad-level insights for an inclusive date range, in the account's own timezone. */
export async function fetchAdInsights(token: string, accountId: string, since: string, until: string, resultTypes: string[]): Promise<AdDay[]> {
  const types = resultTypes.length ? resultTypes : DEFAULT_RESULT_ACTION_TYPES;
  const params = new URLSearchParams({
    fields: "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,inline_link_clicks,actions",
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    use_unified_attribution_setting: "true",
    limit: "500",
    filtering: JSON.stringify([{ field: "ad.effective_status", operator: "IN", value: ALL_AD_STATUSES }]),
  });
  const rows = await graphAll<RawInsight>(`${GRAPH}/${accountId}/insights?${params}`, token);
  return rows.map((r) => {
    const link = parseInt(r.inline_link_clicks ?? "", 10);
    return {
      date: r.date_start,
      ad_id: r.ad_id,
      ad_name: r.ad_name,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      spend: parseFloat(r.spend ?? "0") || 0,
      impressions: parseInt(r.impressions ?? "0", 10) || 0,
      clicks: Number.isFinite(link) ? link : parseInt(r.clicks ?? "0", 10) || 0,
      results: pickResults(r.actions, types),
      actions: r.actions ?? [],
    };
  });
}

// ------------------------------------------------------------------- leads

export type MetaLead = {
  id: string;
  created_time: string;
  ad_id: string;
  ad_name: string;
  form_id: string;
  campaign_name: string;
  field_data: Record<string, string>;
};

type RawLead = Omit<MetaLead, "field_data"> & { field_data?: { name: string; values?: string[] }[] };
const LEAD_FIELDS = "id,created_time,ad_id,ad_name,form_id,campaign_name,field_data";

function toLead(raw: RawLead, fallbackAdId = ""): MetaLead {
  const field_data: Record<string, string> = {};
  for (const f of raw.field_data ?? []) field_data[f.name] = f.values?.[0] ?? "";
  return {
    id: raw.id,
    created_time: raw.created_time,
    ad_id: raw.ad_id || fallbackAdId,
    ad_name: raw.ad_name || "",
    form_id: raw.form_id || "",
    campaign_name: raw.campaign_name || "",
    field_data,
  };
}

/** Leads for one ad created after `sinceUnix` (server-side filter). */
export async function fetchAdLeads(token: string, adId: string, sinceUnix: number): Promise<MetaLead[]> {
  const params = new URLSearchParams({
    fields: LEAD_FIELDS,
    limit: "500",
    filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(sinceUnix) }]),
  });
  const rows = await graphAll<RawLead>(`${GRAPH}/${adId}/leads?${params}`, token);
  return rows.map((r) => toLead(r, adId));
}

/** One lead by id (from the instant webhook). */
export async function fetchLeadById(token: string, leadgenId: string): Promise<MetaLead> {
  const raw = await graphGet<RawLead>(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}`, token);
  return toLead(raw);
}

/** Subscribes the app to a Page's leadgen webhook, using that Page's own token. */
export async function subscribePageToLeads(token: string, pageId: string) {
  const page = await graphGet<{ access_token?: string }>(`${GRAPH}/${pageId}?fields=access_token`, token);
  if (!page.access_token) throw new MetaApiError("This token can't manage that Page (needs pages_manage_metadata).");
  await graphPost(`${GRAPH}/${pageId}/subscribed_apps`, page.access_token, { subscribed_fields: "leadgen" });
}
