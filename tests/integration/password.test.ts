// Password re-check used before account deletion, against the real dev Supabase.
import "./_lock.ts";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { passwordIsValid } from "../../src/lib/verify-password.ts";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, opts);
const cfg = { url: URL_, key: ANON };

const email = `leados-test-${crypto.randomBytes(6).toString("hex")}@example.test`;
const password = crypto.randomBytes(18).toString("base64url");
let userId = "";
const browser = createClient(URL_, ANON, opts); // stands in for the signed-in browser session

before(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const { error: e } = await browser.auth.signInWithPassword({ email, password });
  if (e) throw e;
});

after(async () => {
  await admin.auth.admin.deleteUser(userId);
});

test("P1: the right password passes, and the existing session keeps working", async () => {
  assert.equal(await passwordIsValid(email, password, userId, cfg), true);
  const { data, error } = await browser.auth.getUser();
  assert.equal(error, null, "the browser session was signed out");
  assert.equal(data.user?.id, userId);
});

test("P2: a wrong password fails", async () => {
  assert.equal(await passwordIsValid(email, password + "x", userId, cfg), false);
});

test("P3: an empty password fails without calling Supabase", async () => {
  // An address nothing listens on: any network call would throw, not return false.
  assert.equal(await passwordIsValid(email, "", userId, { url: "http://127.0.0.1:9", key: "x" }), false);
});

test("P2b: the right password for a different user fails", async () => {
  assert.equal(await passwordIsValid(email, password, crypto.randomUUID(), cfg), false);
});
