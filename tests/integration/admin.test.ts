// Platform admin tools against the real dev database (needs migration 0013).
// Throwaway users on @example.test; admins get a real two-factor session by
// enrolling an authenticator and computing the codes here (RFC 6238 TOTP).
import "./_lock.ts";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, opts);
const rand = () => crypto.randomBytes(6).toString("hex");
const users: string[] = [];
const orgs: string[] = [];

function base32(s: string) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += abc.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
function totp(secret: string, t = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

type U = { id: string; email: string; db: SupabaseClient };
async function makeUser(): Promise<U> {
  const email = `leados-test-${rand()}@example.test`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const db = createClient(URL_, ANON, opts);
  const { error: e } = await db.auth.signInWithPassword({ email, password });
  if (e) throw e;
  return { id: data.user.id, email, db };
}

/** A platform admin, optionally with a completed two-factor step in this session. */
async function makeAdmin(role: "super_admin" | "support", withMfa = true): Promise<U> {
  const u = await makeUser();
  const { error } = await admin.from("platform_admins").insert({ user_id: u.id, role });
  if (error) throw error;
  if (withMfa) {
    const { data: f, error: e1 } = await u.db.auth.mfa.enroll({ factorType: "totp", friendlyName: `t-${rand()}` });
    if (e1) throw e1;
    const { error: e2 } = await u.db.auth.mfa.challengeAndVerify({ factorId: f.id, code: totp(f.totp.secret) });
    if (e2) throw e2;
  }
  return u;
}

async function makeOrg(owner: U) {
  const slug = `t-${rand()}`;
  const { error } = await owner.db.rpc("create_organization", { p_name: `Admin Test ${rand()}`, p_slug: slug });
  if (error) throw error;
  const { data } = await admin.from("organizations").select("id, name").eq("slug", slug).single();
  orgs.push(data!.id);
  return data as { id: string; name: string };
}

after(async () => {
  for (const id of orgs) await admin.rpc("purge_organization", { p_org: id });
  await admin.from("support_sessions").delete().in("admin_id", users);
  await admin.from("platform_log").delete().in("actor_id", users);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
});

test("A1: a super admin with two-factor opens a 30-minute support view; it's logged for the customer and the platform", async () => {
  const sa = await makeAdmin("super_admin");
  const org = await makeOrg(await makeUser());
  const { data: expires, error } = await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: "  Customer asked about a sync error " });
  assert.equal(error, null, error?.message);
  const minutes = (Date.parse(expires as string) - Date.now()) / 60_000;
  assert.ok(minutes > 29 && minutes <= 30, `expires in ${minutes} min`);
  const { data: log } = await admin.from("audit_log").select("action, target").eq("org_id", org.id).eq("action", "support.viewed");
  assert.deepEqual(log, [{ action: "support.viewed", target: "Customer asked about a sync error" }]);
  const { count } = await admin.from("platform_log").select("*", { count: "exact", head: true }).eq("actor_id", sa.id).eq("action", "support.viewed");
  assert.equal(count, 1);
});

test("A2–A5: support-role admins, ordinary users, admins without two-factor, and short reasons are refused", async () => {
  const org = await makeOrg(await makeUser());
  const start = (u: U, reason = "Checking an issue") => u.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: reason });
  assert.ok((await start(await makeAdmin("support"))).error, "support role could open a view");
  assert.ok((await start(await makeUser())).error, "an ordinary user could open a view");
  assert.match((await start(await makeAdmin("super_admin", false))).error?.message ?? "", /two-factor/);
  const sa = await makeAdmin("super_admin");
  assert.ok((await start(sa, "ok")).error, "a 2-character reason was accepted");
  assert.ok((await start(sa, "   ")).error, "an empty reason was accepted");
  const { count } = await admin.from("support_sessions").select("*", { count: "exact", head: true }).eq("org_id", org.id);
  assert.equal(count, 0);
});

test("A6–A7: usage gives correct per-workspace counts to platform admins only, with no lead details", async () => {
  const owner = await makeUser();
  const org = await makeOrg(owner);
  await admin.from("ad_accounts").insert([
    { org_id: org.id, meta_account_id: `act_${rand()}`, name: "A", sync_enabled: true, last_synced_at: new Date().toISOString() },
    { org_id: org.id, meta_account_id: `act_${rand()}`, name: "B", sync_enabled: false },
  ]);
  const { data: leads } = await admin.from("leads").insert([{ org_id: org.id, name: "Secret Name", phone_e164: "+919000000077" }, { org_id: org.id, name: "Other" }]).select("id");
  const { data: conv } = await admin.from("wa_conversations").insert({ org_id: org.id, lead_id: leads![0].id, phone: "919000000077" }).select("id").single();
  await admin.from("wa_messages").insert([1, 2, 3].map((i) => ({ org_id: org.id, conversation_id: conv!.id, direction: "in", kind: "text", body: `m${i}` })));

  for (const role of ["super_admin", "support"] as const) {
    const a = await makeAdmin(role);
    const { data, error } = await a.db.rpc("admin_usage");
    assert.equal(error, null, `${role}: ${error?.message}`);
    const row = (data as Record<string, unknown>[]).find((r) => r.org_id === org.id)!;
    assert.ok(row, `${role}: workspace missing`);
    assert.equal(row.members, 1);
    assert.equal(row.ad_accounts_syncing, 1);
    assert.equal(row.leads_30d, 2);
    assert.equal(row.wa_messages_30d, 3);
    assert.ok(row.last_synced_at, "last sync missing");
    assert.ok(!JSON.stringify(data).includes("Secret Name") && !JSON.stringify(data).includes("9000000077"), "lead details leaked");
  }
  assert.ok((await owner.db.rpc("admin_usage")).error, "an ordinary user saw usage");
  assert.match((await (await makeAdmin("super_admin", false)).db.rpc("admin_usage")).error?.message ?? "", /two-factor/);
});

test("A8: health reports failed syncs, the webhook backlog and connections needing reconnection", async () => {
  const org = await makeOrg(await makeUser());
  await admin.from("ad_accounts").insert({ org_id: org.id, meta_account_id: `act_${rand()}`, name: "Broken", last_sync_status: "failed", last_sync_error: "Meta API error 100: test failure" });
  await admin.from("sync_runs").insert({ org_id: org.id, kind: "ads", status: "failed" });
  const dedupe = `test-${rand()}`;
  await admin.from("webhook_events").insert({ kind: "test", dedupe_key: dedupe, org_id: org.id, payload: {}, received_at: new Date(Date.now() - 2 * 3600_000).toISOString() });
  await admin.from("integrations").insert({ org_id: org.id, kind: "meta", status: "needs_reauth", last_error: "token expired" });

  const sa = await makeAdmin("super_admin");
  const { data, error } = await sa.db.rpc("admin_health");
  assert.equal(error, null, error?.message);
  const h = data as { sync_failures: Record<string, unknown>[]; oldest_webhook_seconds: number | null; needs_reauth: Record<string, unknown>[] };
  const f = h.sync_failures.find((r) => r.org_id === org.id)!;
  assert.ok(f, "sync failure missing");
  assert.equal(f.failures_24h, 1);
  assert.match(String(f.latest_error), /test failure/);
  assert.ok((h.oldest_webhook_seconds ?? 0) >= 7000, `backlog ${h.oldest_webhook_seconds}`);
  assert.ok(h.needs_reauth.some((r) => r.org_id === org.id && r.kind === "meta"), "reconnect-needed missing");
  await admin.from("webhook_events").delete().eq("dedupe_key", dedupe);
});

test("A9: 'is my support view active' returns its expiry for my active view; nothing if expired or another workspace", async () => {
  const sa = await makeAdmin("super_admin");
  const org = await makeOrg(await makeUser());
  const other = await makeOrg(await makeUser());
  const { data: started } = await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: "Checking an issue" });
  const { data: active } = await sa.db.rpc("admin_support_session_active", { p_org: org.id });
  assert.equal(Date.parse(active as string), Date.parse(started as string)); // F11: the database's expiry
  assert.equal((await sa.db.rpc("admin_support_session_active", { p_org: other.id })).data, null);
  await admin.from("support_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("admin_id", sa.id);
  assert.equal((await sa.db.rpc("admin_support_session_active", { p_org: org.id })).data, null);
});

test("A10: users and anonymous visitors can't read or write support sessions or the platform log", async () => {
  const u = await makeUser();
  const anon = createClient(URL_, ANON, opts);
  for (const c of [u.db, anon]) {
    for (const t of ["support_sessions", "platform_log"]) {
      const r = await c.from(t).select("*").limit(1);
      assert.ok(r.error || (r.data ?? []).length === 0, `${t} readable`);
      const w = await c.from(t).insert({ admin_id: u.id, org_id: crypto.randomUUID(), reason: "x", expires_at: new Date().toISOString(), actor_id: u.id, action: "x" });
      assert.ok(w.error, `${t} writable`);
    }
  }
});

// ---------------------------------------------------------------- review fixes

test("F1: members can't write platform entries (support visits etc.) into the activity log", async () => {
  const owner = await makeUser();
  const org = await makeOrg(owner);
  for (const action of ["support.viewed", "Support.Viewed", "platform.org_suspended", "platform.plan_changed"]) {
    const r = await owner.db.rpc("write_audit", { p_org: org.id, p_action: action, p_target: "fake" });
    assert.ok(r.error, `${action} was accepted`);
  }
  assert.equal((await owner.db.rpc("write_audit", { p_org: org.id, p_action: "lead.note", p_target: "ok" })).error, null);
});

test("F2: the backlog counts only events still being retried; given-up ones are reported separately", async () => {
  const org = await makeOrg(await makeUser());
  const sa = await makeAdmin("super_admin");
  const dead = `test-dead-${rand()}`;
  await admin.from("webhook_events").insert({ kind: "test", dedupe_key: dead, org_id: org.id, payload: {}, received_at: new Date(Date.now() - 30 * 86400_000).toISOString(), attempts: 8 });
  try {
    const { data } = await sa.db.rpc("admin_health");
    const h = data as { oldest_webhook_seconds: number | null; dead_webhooks: number };
    assert.ok(h.oldest_webhook_seconds === null || h.oldest_webhook_seconds < 29 * 86400, `backlog counted a dead event: ${h.oldest_webhook_seconds}`);
    assert.ok(h.dead_webhooks >= 1, "dead events not reported");
  } finally {
    await admin.from("webhook_events").delete().eq("dedupe_key", dead);
  }
});

test("F3: the database refuses invisible or symbol-only reasons and strips control characters", async () => {
  const sa = await makeAdmin("super_admin");
  const org = await makeOrg(await makeUser());
  for (const bad of ["\u200b\u200b\u200b", "\t\t\t", "\u00a0\u00a0\u00a0", "\u3000\u3000\u3000", "\u0001\u0002\u0003", "\u202e\u202e\u202e", "..."]) {
    const r = await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: bad });
    assert.ok(r.error, `accepted ${JSON.stringify(bad)}`);
  }
  assert.equal((await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: "\u202eCustomer\u200b asked\u0007 about sync" })).error, null);
  const { data } = await admin.from("audit_log").select("target").eq("org_id", org.id).eq("action", "support.viewed");
  assert.deepEqual(data, [{ target: "Customer asked about sync" }]);
});

test("F5: starting again while a view is active reuses it; expired sessions are cleaned up", async () => {
  const sa = await makeAdmin("super_admin");
  const org = await makeOrg(await makeUser());
  const first = await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: "First look" });
  const again = await sa.db.rpc("admin_start_support_session", { p_org: org.id, p_reason: "Second look" });
  assert.equal(Date.parse(again.data as string), Date.parse(first.data as string));
  const { count } = await admin.from("support_sessions").select("*", { count: "exact", head: true }).eq("org_id", org.id);
  assert.equal(count, 1);
  const { count: logged } = await admin.from("audit_log").select("*", { count: "exact", head: true }).eq("org_id", org.id).eq("action", "support.viewed");
  assert.equal(logged, 1);
  await admin.from("support_sessions").update({ expires_at: new Date(Date.now() - 3600_000).toISOString() }).eq("org_id", org.id);
  assert.equal((await admin.rpc("admin_prune_support_sessions")).error, null);
  const { count: left } = await admin.from("support_sessions").select("*", { count: "exact", head: true }).eq("org_id", org.id);
  assert.equal(left, 0);
});

test("F6: a platform admin without two-factor can't list other workspaces or their members", async () => {
  const noMfa = await makeAdmin("super_admin", false);
  const org = await makeOrg(await makeUser());
  const orgsSeen = await noMfa.db.from("organizations").select("id").eq("id", org.id);
  assert.deepEqual(orgsSeen.data ?? [], []);
  const members = await noMfa.db.from("memberships").select("user_id").eq("org_id", org.id);
  assert.deepEqual(members.data ?? [], []);
  const withMfa = await makeAdmin("super_admin");
  assert.equal(((await withMfa.db.from("organizations").select("id").eq("id", org.id)).data ?? []).length, 1);
});

test("F7: health shows no addresses, user ids, email hashes or long numbers", async () => {
  const org = await makeOrg(await makeUser());
  await admin.from("ad_accounts").insert({ org_id: org.id, meta_account_id: `act_${rand()}`, name: "Broken", sync_enabled: true, last_sync_status: "failed", last_sync_error: "Meta API error: lead +919876543210 rejected" });
  const k = `signin:ip:203.0.113.${Math.floor(Math.random() * 200) + 20}`;
  await admin.rpc("rate_limit_hit", { p_key: k, p_max: 1, p_window_seconds: 600 });
  await admin.rpc("rate_limit_hit", { p_key: k, p_max: 1, p_window_seconds: 600 });
  try {
    const sup = await makeAdmin("support");
    const { data } = await sup.db.rpc("admin_health");
    const text = JSON.stringify(data).replace(/"org_id":"[^"]+"/g, "");
    assert.ok(!/203\.0\.113\.\d/.test(text), "an address is shown");
    assert.ok(!text.includes("9876543210"), "a phone number is shown");
    assert.ok(!/[0-9a-f]{32}/.test(text), "a hash is shown");
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), "a user id is shown");
  } finally {
    await admin.from("rate_limits").delete().eq("key", k);
  }
});

test("F8: health lists only blocked counters and enabled failing accounts; usage keeps the last good sync", async () => {
  const org = await makeOrg(await makeUser());
  const yesterday = new Date(Date.now() - 86400_000).toISOString();
  await admin.from("ad_accounts").insert([
    { org_id: org.id, meta_account_id: `act_${rand()}`, name: "Off", sync_enabled: false, last_sync_status: "failed", last_sync_error: "old disabled error" },
    { org_id: org.id, meta_account_id: `act_${rand()}`, name: "On", sync_enabled: true, last_sync_status: "failed", last_sync_error: "current failure", last_synced_at: yesterday },
  ]);
  const busy = `report:ip:198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  for (let i = 0; i < 3; i++) await admin.rpc("rate_limit_hit", { p_key: busy, p_max: 10, p_window_seconds: 600 }); // busy, not blocked
  try {
    const sa = await makeAdmin("super_admin");
    const { data } = await sa.db.rpc("admin_health");
    const h = data as { sync_failures: { org_id: string; latest_error: string }[]; blocked: { kind: string; keys: number }[] };
    assert.equal(h.sync_failures.find((f) => f.org_id === org.id)?.latest_error, "current failure");
    assert.ok(!h.blocked.some((b) => b.kind === "report:ip"), "a counter that isn't blocked was listed");
    const { data: usage } = await sa.db.rpc("admin_usage");
    const row = (usage as { org_id: string; last_synced_at: string | null }[]).find((r) => r.org_id === org.id);
    assert.equal(Date.parse(row!.last_synced_at!), Date.parse(yesterday));
  } finally {
    await admin.from("rate_limits").delete().eq("key", busy);
  }
});
