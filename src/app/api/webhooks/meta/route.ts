import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/server/supabase-admin";
import { EV, inngest } from "@/server/jobs/client";
import { applyStatus, type InboundEvent } from "@/server/bot/runner";

/**
 * Meta webhook (leadgen).
 *
 * GET  — Meta's one-time verification handshake.
 * POST — Verify the signature, store each lead event in webhook_events
 *        (deduplicated by leadgen_id) BEFORE acknowledging, then queue it.
 *        If queueing fails, the sweeper job re-queues it within minutes,
 *        so a lead is never lost to an outage after Meta got its 200.
 *
 * The workspace comes from the Page id (meta_pages), never from the body.
 */

function safeEqual(a: string, b: string) {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && safeEqual(p.get("hub.verify_token") ?? "", expected)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Accepts any of the comma-separated app secrets, so the secret can be rotated without downtime. */
function verifySignature(raw: string, header: string | null) {
  const secrets = (process.env.META_APP_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!header?.startsWith("sha256=") || !secrets.length) return false;
  const given = Buffer.from(header.slice(7), "hex");
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

type LeadgenValue = { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; created_time?: number };
type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: {
    id: string;
    from: string;
    type: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  }[];
  statuses?: { id: string; status: string; errors?: { title?: string; code?: number }[] }[];
};
type Body = { object?: string; entry?: { id?: string; changes?: { field?: string; value?: LeadgenValue & WaValue }[] }[] };

/** WhatsApp messages: route by the receiving number's phone_number_id, store, queue. */
async function handleWhatsApp(body: Body) {
  const db = adminDb();
  const inbound: { phoneNumberId: string; event: InboundEvent }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "messages" || !v?.metadata?.phone_number_id) continue;
      await Promise.all((v.statuses ?? []).filter((st) => st.id && st.status).map((st) => applyStatus(st.id, st.status, st.errors?.[0]?.title)));
      for (const m of v.messages ?? []) {
        if (!m.id || !/^\d{6,16}$/.test(m.from ?? "")) continue;
        const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
        inbound.push({
          phoneNumberId: v.metadata.phone_number_id,
          event: {
            messageId: m.id,
            from: m.from,
            profileName: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name?.slice(0, 120),
            type: m.type,
            text: m.text?.body?.slice(0, 4000),
            buttonText: m.button?.text?.slice(0, 200),
            replyId: reply?.id?.slice(0, 200),
            replyTitle: reply?.title?.slice(0, 200),
          },
        });
      }
    }
  }
  if (!inbound.length) return NextResponse.json({ ok: true });

  const numberIds = [...new Set(inbound.map((i) => i.phoneNumberId))];
  const { data: ints } = await db.from("integrations").select("external_id, org_id").eq("kind", "whatsapp").eq("status", "active").in("external_id", numberIds);
  const orgByNumber = new Map(((ints ?? []) as { external_id: string; org_id: string }[]).map((i) => [i.external_id, i.org_id]));

  // A number no workspace owns (e.g. one whose workspace was deleted): acknowledge, keep nothing.
  const rows = inbound
    .filter((i) => orgByNumber.has(i.phoneNumberId))
    .map((i) => ({ kind: "wa.message", dedupe_key: i.event.messageId, org_id: orgByNumber.get(i.phoneNumberId)!, payload: i.event }));
  if (!rows.length) return NextResponse.json({ ok: true, stored: 0 });
  const { data: stored, error } = await db.from("webhook_events").upsert(rows as never, { onConflict: "kind,dedupe_key", ignoreDuplicates: true }).select("id, org_id, payload");
  if (error) {
    console.error("[webhook] could not store WhatsApp messages", error.message);
    return new NextResponse("Storage error", { status: 500 });
  }
  const toQueue = ((stored ?? []) as { id: string; org_id: string | null; payload: InboundEvent }[]).filter((r) => r.org_id);
  if (toQueue.length) {
    try {
      await inngest.send(toQueue.map((r) => ({ id: `wh-${r.id}`, name: EV.waInbound, data: { webhookEventId: r.id, orgId: r.org_id, from: r.payload.from } })));
    } catch (err) {
      console.error("[webhook] queueing WhatsApp failed; sweeper will retry", (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true, stored: stored?.length ?? 0 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new NextResponse("Payload too large", { status: 413 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: Body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  if (body.object === "whatsapp_business_account") return handleWhatsApp(body);
  if (body.object !== "page") return NextResponse.json({ ok: true, ignored: true });

  const leads: LeadgenValue[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field === "leadgen" && v?.leadgen_id && /^\d+$/.test(v.leadgen_id) && v.page_id && /^\d+$/.test(v.page_id)) {
        leads.push(v);
      }
    }
  }
  if (!leads.length) return NextResponse.json({ ok: true });

  const db = adminDb();
  const pageIds = [...new Set(leads.map((l) => l.page_id!))];
  const { data: pages } = await db.from("meta_pages").select("page_id, org_id").in("page_id", pageIds);
  const orgByPage = new Map(((pages ?? []) as { page_id: string; org_id: string }[]).map((p) => [p.page_id, p.org_id]));

  // A Page no workspace owns: acknowledge, keep nothing.
  const rows = leads.filter((l) => orgByPage.has(l.page_id!)).map((l) => ({
    kind: "meta.leadgen",
    dedupe_key: l.leadgen_id!,
    org_id: orgByPage.get(l.page_id!)!,
    payload: { leadgen_id: l.leadgen_id, page_id: l.page_id, form_id: l.form_id, ad_id: l.ad_id, created_time: l.created_time },
  }));
  if (!rows.length) return NextResponse.json({ ok: true, stored: 0 });
  // Duplicates (Meta retries) hit the unique (kind, dedupe_key) and are skipped.
  const { data: stored, error } = await db
    .from("webhook_events")
    .upsert(rows as never, { onConflict: "kind,dedupe_key", ignoreDuplicates: true })
    .select("id, org_id");
  if (error) {
    // Not stored: let Meta retry rather than acknowledging a lead we don't have.
    console.error("[webhook] could not store events", error.message);
    return new NextResponse("Storage error", { status: 500 });
  }

  const toQueue = ((stored ?? []) as { id: string; org_id: string | null }[]).filter((r) => r.org_id);
  if (toQueue.length) {
    try {
      await inngest.send(toQueue.map((r) => ({ id: `wh-${r.id}`, name: EV.leadReceived, data: { webhookEventId: r.id, orgId: r.org_id } })));
    } catch (err) {
      // Stored but not queued: the sweeper picks it up. Still acknowledge.
      console.error("[webhook] queueing failed; sweeper will retry", (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true, stored: stored?.length ?? 0 });
}
