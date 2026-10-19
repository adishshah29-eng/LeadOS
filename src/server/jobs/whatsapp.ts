import "server-only";
import { z } from "zod";
import { NonRetriableError } from "inngest";
import { adminDb } from "@/server/supabase-admin";
import { EV, inngest } from "./client";
import { handleInbound, runFollowups, sendManual, startForLead, type InboundEvent } from "@/server/bot/runner";

/*
 * WhatsApp bot jobs. Inbound messages from one phone number are handled one
 * at a time (concurrency key = org + phone) so replies never cross; welcome
 * messages and follow-ups are their own lanes.
 */

const uuid = z.uuid();

export const waLeadStart = inngest.createFunction(
  {
    id: "wa-lead-start",
    triggers: [{ event: EV.waLeadStart }],
    concurrency: [{ key: "event.data.orgId", limit: 5 }],
    // WhatsApp's own per-number throughput is the real limit; stay well under it.
    throttle: { limit: 60, period: "1m", key: "event.data.orgId" },
    retries: 2,
  },
  async ({ event, step }) => {
    const data = z.object({ orgId: uuid, leadId: uuid }).parse(event.data);
    return step.run("welcome", () => startForLead(data.orgId, data.leadId));
  },
);

export const waInbound = inngest.createFunction(
  {
    id: "wa-message-received",
    triggers: [{ event: EV.waInbound }],
    concurrency: [{ key: 'event.data.orgId + "-" + event.data.from', limit: 1 }],
    retries: 4,
  },
  async ({ event, step }) => {
    const { webhookEventId } = z.object({ webhookEventId: uuid }).passthrough().parse(event.data);
    return step.run("handle", async () => {
      const db = adminDb();
      const { data } = await db.from("webhook_events").select("id, org_id, payload, processed_at, attempts").eq("id", webhookEventId).maybeSingle();
      const row = data as { id: string; org_id: string | null; payload: InboundEvent; processed_at: string | null; attempts: number } | null;
      if (!row || row.processed_at) return { skipped: true };
      const done = (lastError: string | null) =>
        db.from("webhook_events").update({ processed_at: new Date().toISOString(), last_error: lastError } as never).eq("id", row.id);
      if (!row.org_id) {
        await done("No workspace owns this WhatsApp number.");
        throw new NonRetriableError("unrouted WhatsApp message");
      }
      try {
        const result = await handleInbound(row.org_id, row.payload);
        await done(null);
        return result;
      } catch (err) {
        await db.from("webhook_events").update({ attempts: row.attempts + 1, last_error: String((err as Error).message).slice(0, 500) } as never).eq("id", row.id);
        throw err;
      }
    });
  },
);

export const waManual = inngest.createFunction(
  {
    id: "wa-send-manual",
    triggers: [{ event: EV.waManual }],
    concurrency: [{ key: "event.data.conversationId", limit: 1 }],
    // A manual message must not be sent twice: no automatic retry.
    retries: 0,
  },
  async ({ event, step }) => {
    const d = z.object({ orgId: uuid, conversationId: uuid, text: z.string().min(1).max(4000), userId: uuid }).parse(event.data);
    return step.run("send", () => sendManual(d.orgId, d.conversationId, d.text, d.userId));
  },
);

/** Follow-ups go out hourly during working hours in India, never at night. */
export const waFollowups = inngest.createFunction(
  { id: "wa-followups", triggers: [{ cron: "TZ=Asia/Kolkata 15 10-19 * * *" }] },
  async ({ step }) => {
    const orgs = await step.run("list-orgs", async () => {
      const db = adminDb();
      const { data: enabled } = await db.from("bot_settings").select("org_id").eq("enabled", true);
      const ids = ((enabled ?? []) as { org_id: string }[]).map((r) => r.org_id);
      if (!ids.length) return [];
      const { data: active } = await db.from("integrations").select("org_id").eq("kind", "whatsapp").eq("status", "active").in("org_id", ids);
      return ((active ?? []) as { org_id: string }[]).map((r) => r.org_id);
    });
    const results: Record<string, unknown> = {};
    for (const orgId of orgs) results[orgId] = await step.run(`followups-${orgId}`, () => runFollowups(orgId));
    return results;
  },
);

export const whatsappFunctions = [waLeadStart, waInbound, waManual, waFollowups];
