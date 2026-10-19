import "server-only";
import { GRAPH, graphGet, graphPost, MetaApiError } from "@/server/meta/graph";
import type { Outbound } from "./brain";

/**
 * WhatsApp Cloud API, one workspace's number at a time.
 *
 * WhatsApp's rules: a business may start a conversation (or write after 24h
 * of silence) only with an approved template; within 24h of the customer's
 * last message, free text, buttons and lists are allowed.
 *
 * WA_DRY_RUN=1 (development only) logs messages instead of sending them, so
 * the whole bot can be exercised without a WhatsApp number.
 */

export type SendResult = { ok: boolean; messageId?: string; error?: string; code?: number };
export type WaNumber = { phoneNumberId: string; token: string };

const DRY_RUN = process.env.WA_DRY_RUN === "1" && process.env.NODE_ENV !== "production";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function post(n: WaNumber, body: Record<string, unknown>): Promise<SendResult> {
  if (DRY_RUN) {
    console.info("[wa dry-run]", JSON.stringify(body).slice(0, 300));
    return { ok: true, messageId: `dryrun.${crypto.randomUUID()}` };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
    try {
      const res = await fetch(`${GRAPH}/${n.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${n.token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number; is_transient?: boolean; error_data?: { details?: string } };
      };
      if (res.ok) return { ok: true, messageId: json.messages?.[0]?.id };
      const result = { ok: false, error: json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`, code: json.error?.code };
      // Only retry what is safe to repeat. A send that may have gone through is not retried.
      const retryable = res.status === 429 || json.error?.is_transient;
      if (!retryable || attempt === 2) return result;
    } catch (err) {
      // Network error or timeout: the message may have been delivered. Don't resend.
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, error: "WhatsApp send failed" };
}

export function sendOutbound(n: WaNumber, to: string, m: Outbound): Promise<SendResult> {
  if (m.kind === "text") return post(n, { to, type: "text", text: { body: clip(m.body, 4000), preview_url: false } });
  if (m.kind === "buttons") {
    return post(n, {
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clip(m.body, 1024) },
        action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })) },
      },
    });
  }
  return post(n, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(m.body, 1024) },
      action: {
        button: clip(m.button, 20),
        sections: [
          {
            title: "Options",
            rows: m.rows.slice(0, 10).map((r) => ({ id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })),
          },
        ],
      },
    },
  });
}

/** Sends an approved template; `params` fill {{1}}, {{2}}… in its body. */
export function sendTemplate(n: WaNumber, to: string, name: string, language: string, params: string[]): Promise<SendResult> {
  return post(n, {
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      components: params.length
        ? [
            {
              type: "body",
              // Template parameters can't contain newlines/tabs or 4+ spaces.
              parameters: params.map((t) => ({ type: "text", text: clip(t.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   "), 1000) || "-" })),
            },
          ]
        : [],
    },
  });
}

export function markRead(n: WaNumber, messageId: string) {
  return post(n, { status: "read", message_id: messageId }).catch(() => undefined);
}

/** Checks a phone number id + token when connecting; returns what to show in Settings. */
export async function describeNumber(token: string, phoneNumberId: string) {
  return graphGet<{ id: string; display_phone_number: string; verified_name: string; quality_rating?: string }>(
    `${GRAPH}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
    token,
  );
}

/**
 * Finds the WhatsApp Business Account that owns this number. Tries the
 * account the customer typed (if any), then every account the token was
 * granted (debug_token lists them), and keeps the one whose phone numbers
 * include this id. Null when the token can't see the account.
 */
export async function findWaba(token: string, phoneNumberId: string, hint?: string | null): Promise<string | null> {
  const candidates = new Set<string>(hint ? [hint] : []);
  try {
    const dbg = await graphGet<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`,
      token,
    );
    for (const s of dbg.data?.granular_scopes ?? []) {
      if (s.scope.startsWith("whatsapp_business")) for (const id of s.target_ids ?? []) candidates.add(id);
    }
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
  }
  for (const waba of candidates) {
    if (!/^\d{6,20}$/.test(waba)) continue;
    try {
      const nums = await graphGet<{ data?: { id: string }[] }>(`${GRAPH}/${waba}/phone_numbers?fields=id&limit=100`, token);
      if (nums.data?.some((n) => n.id === phoneNumberId)) return waba;
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;
    }
  }
  return null;
}

/**
 * Subscribes our Meta app to the customer's WhatsApp Business Account, so
 * their customers' replies reach /api/webhooks/meta. Without this the bot
 * can send but never hears back.
 */
export async function subscribeWaba(token: string, wabaId: string): Promise<void> {
  await graphPost(`${GRAPH}/${wabaId}/subscribed_apps`, token, {});
}

/** Connect-time check: which account owns the number, and is it subscribed to us. */
export async function linkWaba(token: string, phoneNumberId: string, hint?: string | null) {
  const wabaId = await findWaba(token, phoneNumberId, hint);
  if (!wabaId) {
    return {
      waba_id: null,
      subscribed_at: null,
      subscribe_error: "This token can't see the WhatsApp Business Account that owns the number. Give the System User full control of that WhatsApp account, or enter its ID.",
    };
  }
  try {
    await subscribeWaba(token, wabaId);
    return { waba_id: wabaId, subscribed_at: new Date().toISOString(), subscribe_error: null };
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    return { waba_id: wabaId, subscribed_at: null, subscribe_error: err.message.slice(0, 300) };
  }
}

export type WabaLink = Awaited<ReturnType<typeof linkWaba>>;

/** The token was revoked or expired: the workspace has to reconnect. */
export const isAuthSendError = (code?: number) => code === 190 || code === 102;

/** Permanent errors: retrying tomorrow won't help (number not on WhatsApp, template problems). */
export const isPermanentSendError = (code?: number) => code === 131026 || (code !== undefined && code >= 132000 && code < 133000);
