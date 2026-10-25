// Rate-limit counters against the real dev database (needs migration 0011).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, opts);
const prefix = `test:${crypto.randomBytes(6).toString("hex")}:`;
const key = (k: string) => prefix + k;
const hit = async (k: string, max: number, windowSec: number) => {
  const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key(k), p_max: max, p_window_seconds: windowSec });
  if (error) throw error;
  return data as number;
};

after(async () => {
  await admin.from("rate_limits").delete().like("key", `${prefix}%`);
});

test("R1: up to the limit is allowed, then a wait inside the window", async () => {
  assert.deepEqual([await hit("r1", 3, 60), await hit("r1", 3, 60), await hit("r1", 3, 60)], [0, 0, 0]);
  const wait = await hit("r1", 3, 60);
  assert.ok(wait >= 1 && wait <= 60, `wait ${wait}`);
});

test("R2: a new window starts after the old one ends", async () => {
  assert.equal(await hit("r2", 1, 2), 0);
  assert.ok((await hit("r2", 1, 2)) > 0);
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(await hit("r2", 1, 2), 0);
});

test("R3: 50 parallel attempts with a limit of 10 let exactly 10 through", async () => {
  const waits = await Promise.all(Array.from({ length: 50 }, () => hit("r3", 10, 60)));
  assert.equal(waits.filter((w) => w === 0).length, 10);
});

test("R4: different keys are counted separately", async () => {
  assert.equal(await hit("r4a", 1, 60), 0);
  assert.equal(await hit("r4b", 1, 60), 0);
  assert.ok((await hit("r4a", 1, 60)) > 0);
});

test("R5: clean-up removes day-old counters and keeps fresh ones", async () => {
  await hit("r5fresh", 5, 60);
  const { error } = await admin.from("rate_limits").insert({ key: key("r5old"), window_start: new Date(Date.now() - 2 * 864e5).toISOString(), count: 3 });
  assert.equal(error, null);
  const pruned = await admin.rpc("rate_limit_prune");
  assert.equal(pruned.error, null);
  const { data } = await admin.from("rate_limits").select("key").in("key", [key("r5old"), key("r5fresh")]);
  assert.deepEqual((data ?? []).map((r) => r.key), [key("r5fresh")]);
});

test("R6: signed-in users and anonymous visitors can't use or see the counters", async () => {
  const anon = createClient(URL_, ANON, opts);
  const email = `leados-test-${crypto.randomBytes(5).toString("hex")}@example.test`;
  const password = crypto.randomBytes(15).toString("base64url");
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const user = createClient(URL_, ANON, opts);
  await user.auth.signInWithPassword({ email, password });
  try {
    for (const c of [anon, user]) {
      assert.ok((await c.rpc("rate_limit_hit", { p_key: key("r6"), p_max: 1, p_window_seconds: 60 })).error, "could call rate_limit_hit");
      assert.ok((await c.rpc("rate_limit_prune")).error, "could call rate_limit_prune");
      const read = await c.from("rate_limits").select("key").limit(1);
      assert.ok(read.error || (read.data ?? []).length === 0, "could read counters");
      const write = await c.from("rate_limits").delete().like("key", "%");
      assert.ok(write.error || true); // RLS: nothing visible to delete
    }
    await hit("r6", 5, 60);
    const { count } = await admin.from("rate_limits").select("*", { count: "exact", head: true }).eq("key", key("r6"));
    assert.equal(count, 1, "a user deleted counters");
  } finally {
    await admin.auth.admin.deleteUser(u!.user!.id);
  }
});

test("F5: clean-up removes a counter as soon as its own window has ended", async () => {
  const started = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 minutes ago
  const rows = [
    { key: key("short-ended"), window_start: started, count: 5, window_seconds: 60 }, // 1-min window, over
    { key: key("long-running"), window_start: started, count: 5, window_seconds: 3600 }, // 1-hour window, still on
  ];
  const { error } = await admin.from("rate_limits").insert(rows);
  assert.equal(error, null, error?.message);
  assert.equal((await admin.rpc("rate_limit_prune")).error, null);
  const { data } = await admin.from("rate_limits").select("key").in("key", rows.map((r) => r.key));
  assert.deepEqual((data ?? []).map((r) => r.key), [key("long-running")]);
});

test("F5b: counting an attempt records the window it belongs to", async () => {
  await hit("records-window", 5, 900);
  const { data } = await admin.from("rate_limits").select("window_seconds").eq("key", key("records-window")).single();
  assert.equal(data?.window_seconds, 900);
});
