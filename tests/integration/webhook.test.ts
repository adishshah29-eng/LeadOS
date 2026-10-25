// Meta webhook against the running app and the real dev database.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const secret = (process.env.META_APP_SECRET ?? "").split(",")[0].trim();
const keys: string[] = [];

async function post(body: object) {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return fetch(`${BASE}/api/webhooks/meta`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body: raw });
}

const stored = async (key: string) => {
  const { count } = await admin.from("webhook_events").select("*", { count: "exact", head: true }).eq("dedupe_key", key);
  return count ?? 0;
};

after(async () => {
  if (keys.length) await admin.from("webhook_events").delete().in("dedupe_key", keys);
});

test("I8: events for a number or Page no workspace owns are acknowledged but not stored", async () => {
  const msgId = `wamid.TEST.${crypto.randomUUID()}`;
  const leadgenId = String(Date.now()) + "77";
  keys.push(msgId, leadgenId);

  const wa = await post({
    object: "whatsapp_business_account",
    entry: [{ id: "x", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "999000111222333" },
      messages: [{ id: msgId, from: "919000000002", type: "text", text: { body: "personal data that must not be kept" } }],
    } }] }],
  });
  assert.equal(wa.status, 200);

  const page = await post({
    object: "page",
    entry: [{ id: "888000111222", changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: "888000111222" } }] }],
  });
  assert.equal(page.status, 200);

  assert.equal(await stored(msgId), 0, "unrouted WhatsApp message was stored");
  assert.equal(await stored(leadgenId), 0, "unrouted lead event was stored");
});
