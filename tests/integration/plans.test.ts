// Plan limits against the real dev database (needs migration 0009).
// Throwaway users on @example.test; everything is removed in after().
import "./_lock.ts";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LIMITS } from "../../src/lib/plans.ts";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, opts);
const rand = () => crypto.randomBytes(6).toString("hex");

type User = { id: string; email: string; db: SupabaseClient };
const users: string[] = [];
const orgs: string[] = [];

async function makeUser(): Promise<User> {
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

async function makeOrg(owner: User, plan: string) {
  const slug = `t-${rand()}`;
  const { error } = await owner.db.rpc("create_organization", { p_name: `Plan Test ${rand()}`, p_slug: slug });
  if (error) throw error;
  const { data } = await admin.from("organizations").select("id").eq("slug", slug).single();
  orgs.push(data!.id);
  await setPlan(data!.id, plan);
  return data!.id as string;
}

const setPlan = async (orgId: string, plan: string) => {
  const { error } = await admin.from("organizations").update({ plan }).eq("id", orgId);
  if (error) throw error;
};

const addAccount = (u: User, orgId: string, syncEnabled = true) =>
  u.db.from("ad_accounts").insert({ org_id: orgId, meta_account_id: `act_${rand()}`, name: "Acct", sync_enabled: syncEnabled }).select("id").single();

const invite = (u: User, orgId: string, email = `inv-${rand()}@example.test`, tokenHash = rand() + rand()) =>
  u.db.rpc("create_invitation", { p_org: orgId, p_email: email, p_role: "agent", p_token_hash: tokenHash });

const connectWa = (u: User, orgId: string) =>
  u.db.rpc("connect_whatsapp", {
    p_org: orgId,
    p_token: "test-token-" + rand() + rand(),
    p_phone_number_id: String(Date.now()) + String(Math.floor(Math.random() * 1000)),
    p_display_name: "Test number",
    p_available: {},
  });

const reportLink = (u: User, orgId: string, tokenHash = crypto.createHash("sha256").update(rand()).digest("hex")) =>
  u.db.from("report_links").insert({ org_id: orgId, label: "Client", token_hash: tokenHash, created_by: u.id, expires_at: new Date(Date.now() + 864e5).toISOString() });

const LIMIT = (what: string) => new RegExp(`plan limit: ${what}`);

after(async () => {
  for (const id of orgs) await admin.rpc("purge_organization", { p_org: id });
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
});

test("L1: Starter syncs 2 ad accounts; a 3rd is refused", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  assert.equal((await addAccount(u, org)).error, null);
  assert.equal((await addAccount(u, org)).error, null);
  assert.match((await addAccount(u, org)).error?.message ?? "", LIMIT("ad_accounts"));
});

test("L2: Starter may add a 3rd account switched off, but not turn it on", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  await addAccount(u, org);
  await addAccount(u, org);
  const off = await addAccount(u, org, false);
  assert.equal(off.error, null);
  const on = await u.db.from("ad_accounts").update({ sync_enabled: true }).eq("id", off.data!.id);
  assert.match(on.error?.message ?? "", LIMIT("ad_accounts"));
});

test("L3: after a downgrade, existing accounts keep syncing and can be edited; no new ones", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "growth");
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push((await addAccount(u, org)).data!.id);
  await setPlan(org, "starter");
  const { count } = await admin.from("ad_accounts").select("*", { count: "exact", head: true }).eq("org_id", org).eq("sync_enabled", true);
  assert.equal(count, 5);
  const rename = await u.db.from("ad_accounts").update({ name: "Renamed" }).eq("id", ids[0]);
  assert.equal(rename.error, null);
  assert.match((await addAccount(u, org)).error?.message ?? "", LIMIT("ad_accounts"));
});

test("L4: Agency syncs 25 ad accounts", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "agency");
  for (let i = 0; i < 25; i++) assert.equal((await addAccount(u, org)).error, null, `account ${i + 1}`);
});

test("L5: Starter seats count pending invites: owner + 2 invites, then a 3rd is refused", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  assert.equal((await invite(u, org)).error, null);
  assert.equal((await invite(u, org)).error, null);
  assert.match((await invite(u, org)).error?.message ?? "", LIMIT("seats"));
});

test("L6: after a downgrade to Starter, only 2 of 5 pending invites can be accepted", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "growth");
  const invitees: { user: User; hash: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const user = await makeUser();
    const hash = crypto.createHash("sha256").update(rand()).digest("hex");
    assert.equal((await invite(u, org, user.email, hash)).error, null);
    invitees.push({ user, hash });
  }
  await setPlan(org, "starter");
  const results = [];
  for (const i of invitees) results.push((await i.user.db.rpc("accept_invitation", { p_token_hash: i.hash })).error?.message ?? "ok");
  assert.deepEqual(results.slice(0, 2), ["ok", "ok"]);
  for (const r of results.slice(2)) assert.match(r, LIMIT("seats"));
});

test("L7: WhatsApp connects on Growth, not on Starter", async () => {
  const u = await makeUser();
  const starter = await makeOrg(u, "starter");
  assert.match((await connectWa(u, starter)).error?.message ?? "", LIMIT("whatsapp"));
  const growth = await makeOrg(u, "growth");
  assert.equal((await connectWa(u, growth)).error, null);
});

test("L8: a downgrade leaves a connected WhatsApp number active, and its token can still be refreshed", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "growth");
  assert.equal((await connectWa(u, org)).error, null);
  await setPlan(org, "starter");
  const { data } = await admin.from("integrations").select("status").eq("org_id", org).eq("kind", "whatsapp").single();
  assert.equal(data!.status, "active");
  // F10: refreshing an existing connection's token is not "adding" WhatsApp.
  assert.equal((await connectWa(u, org)).error, null);
});

test("L9: report links only on trial and Agency; an existing link still opens after a downgrade", async () => {
  const u = await makeUser();
  for (const plan of ["starter", "growth"]) {
    assert.match((await reportLink(u, await makeOrg(u, plan))).error?.message ?? "", LIMIT("report_links"), plan);
  }
  assert.equal((await reportLink(u, await makeOrg(u, "trial"))).error, null);
  const agency = await makeOrg(u, "agency");
  const hash = crypto.createHash("sha256").update(rand()).digest("hex");
  assert.equal((await reportLink(u, agency, hash)).error, null);
  await setPlan(agency, "growth");
  const anon = createClient(URL_, ANON, opts);
  const { data, error } = await anon.rpc("public_report", { p_token_hash: hash, p_days: 30 });
  assert.equal(error, null);
  assert.ok(data, "the existing link stopped working");
});

test("L10: calling the database directly with a user's session hits the same limits", async () => {
  // L1, L5, L7 and L9 already go straight to the database with the user's session;
  // this checks a raw insert into invitations as well (bypassing create_invitation).
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  await invite(u, org);
  await invite(u, org);
  const raw = await u.db.from("invitations").insert({ org_id: org, email: `raw-${rand()}@example.test`, role: "agent", token_hash: rand() + rand() });
  assert.ok(raw.error, "a raw insert went through");
});

test("L11: leads are never blocked, even at every limit", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  await addAccount(u, org);
  await addAccount(u, org);
  await invite(u, org);
  await invite(u, org);
  const meta = await admin.rpc("worker_ingest_meta_leads", { p_org: org, p_rows: [{ meta_lead_id: `ml_${rand()}`, name: "Meta Lead" }] });
  assert.equal(meta.error, null);
  assert.equal((meta.data as string[]).length, 1);
  const manual = await u.db.from("leads").insert({ org_id: org, name: "Walk-in", source: "manual" });
  assert.equal(manual.error, null);
});

test("L12: the app's limits equal the database's", async () => {
  const { data, error } = await admin.from("plan_limits").select("plan, ad_accounts, seats, whatsapp, report_links");
  assert.equal(error, null);
  const db = Object.fromEntries((data ?? []).map((r) => [r.plan, { adAccounts: r.ad_accounts, seats: r.seats, whatsapp: r.whatsapp, reportLinks: r.report_links }]));
  assert.deepEqual(db, LIMITS);
});

// ---------------------------------------------------------------- review fixes

test("F2: an ad account, report link or connection can't be moved to another workspace", async () => {
  const u = await makeUser();
  const a = await makeOrg(u, "agency");
  const b = await makeOrg(u, "trial"); // same user is owner of both
  const acct = await addAccount(u, a);
  const move = await u.db.from("ad_accounts").update({ org_id: b }).eq("id", acct.data!.id);
  assert.match(move.error?.message ?? "", /org_id is immutable/);

  const hash = crypto.createHash("sha256").update(rand()).digest("hex");
  await reportLink(u, a, hash);
  const moveLink = await u.db.from("report_links").update({ org_id: b }).eq("token_hash", hash);
  assert.match(moveLink.error?.message ?? "", /org_id is immutable/);

  // Users can't update connections at all (no RLS update policy: 0 rows change, no error);
  // the immutability trigger also guards server-side code. Check the outcome.
  await connectWa(u, a);
  await u.db.from("integrations").update({ org_id: b }).eq("org_id", a).eq("kind", "whatsapp");
  const stillThere = await admin.from("integrations").select("org_id").eq("kind", "whatsapp").in("org_id", [a, b]);
  assert.deepEqual((stillThere.data ?? []).map((r) => r.org_id), [a]);
  const serverMove = await admin.from("integrations").update({ org_id: b }).eq("org_id", a).eq("kind", "whatsapp");
  assert.match(serverMove.error?.message ?? "", /org_id is immutable/);
});

test("F3: a report link can only be revoked after creation, not extended or relabelled", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "agency");
  const hash = crypto.createHash("sha256").update(rand()).digest("hex");
  await reportLink(u, org, hash);
  const extend = await u.db.from("report_links").update({ expires_at: new Date(Date.now() + 3650 * 864e5).toISOString() }).eq("token_hash", hash);
  assert.ok(extend.error, "expiry was extended");
  const relabel = await u.db.from("report_links").update({ label: "Other" }).eq("token_hash", hash);
  assert.ok(relabel.error, "label was changed");
  const revoke = await u.db.from("report_links").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
  assert.equal(revoke.error, null);
  const unrevoke = await u.db.from("report_links").update({ revoked_at: null }).eq("token_hash", hash);
  assert.ok(unrevoke.error, "a revoked link was brought back");
});

test("F4: after the free trial ends, direct database calls can't add WhatsApp, invites, links or syncing accounts", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "trial");
  assert.equal((await addAccount(u, org)).error, null); // allowed while the trial runs
  await admin.from("organizations").update({ trial_ends_at: new Date(Date.now() - 864e5).toISOString() }).eq("id", org);
  assert.match((await connectWa(u, org)).error?.message ?? "", LIMIT("whatsapp"));
  assert.match((await invite(u, org)).error?.message ?? "", LIMIT("seats"));
  assert.match((await reportLink(u, org)).error?.message ?? "", LIMIT("report_links"));
  assert.match((await addAccount(u, org)).error?.message ?? "", LIMIT("ad_accounts"));
  // never limited: leads
  assert.equal((await u.db.from("leads").insert({ org_id: org, name: "Still captured", source: "manual" })).error, null);
});

test("F5: a member accepting another invitation while the workspace is full is not refused", async () => {
  const owner = await makeUser();
  const org = await makeOrg(owner, "growth");
  const member = await makeUser();
  const newcomer = await makeUser();
  const hash = () => crypto.createHash("sha256").update(rand()).digest("hex");
  const [h1, h2, h3] = [hash(), hash(), hash()];
  await invite(owner, org, member.email, h1);
  await member.db.rpc("accept_invitation", { p_token_hash: h1 });
  await invite(owner, org, newcomer.email, h2);
  await invite(owner, org, member.email, h3); // a second invitation to someone already in
  await setPlan(org, "starter");
  assert.equal((await newcomer.db.rpc("accept_invitation", { p_token_hash: h2 })).error, null); // now 3 of 3
  const again = await member.db.rpc("accept_invitation", { p_token_hash: h3 });
  assert.equal(again.error, null, again.error?.message);
});

test("F6: each pending email takes one seat; an invite to a member takes none", async () => {
  const owner = await makeUser();
  const org = await makeOrg(owner, "starter");
  assert.equal((await invite(owner, org, "a@example.test")).error, null);
  assert.equal((await invite(owner, org, "a@example.test")).error, null); // same email again
  assert.equal((await invite(owner, org, "b@example.test")).error, null);
  assert.match((await invite(owner, org, "c@example.test")).error?.message ?? "", LIMIT("seats"));
  assert.equal((await invite(owner, org, "A@example.test")).error, null, "a repeat of a pending email at the limit was refused");

  const o2 = await makeUser();
  const org2 = await makeOrg(o2, "starter");
  const m = await makeUser();
  const h = crypto.createHash("sha256").update(rand()).digest("hex");
  await invite(o2, org2, m.email, h);
  await m.db.rpc("accept_invitation", { p_token_hash: h }); // owner + m
  assert.equal((await invite(o2, org2, m.email)).error, null); // a member again: no seat
  assert.equal((await invite(o2, org2, "x@example.test")).error, null);
  assert.match((await invite(o2, org2, "y@example.test")).error?.message ?? "", LIMIT("seats"));
});

test("F8b: pausing follow-ups clears the schedule for the workspace only", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  const other = await makeOrg(u, "growth");
  const seed = async (orgId: string) => {
    const { data: lead } = await admin.from("leads").insert({ org_id: orgId, name: "L" }).select("id").single();
    await admin.from("wa_conversations").insert({ org_id: orgId, lead_id: lead!.id, phone: "9190000" + Math.floor(Math.random() * 1e5), next_followup_at: new Date(Date.now() - 864e5).toISOString() });
  };
  await seed(org);
  await seed(other);
  const { error } = await admin.rpc("worker_pause_followups", { p_org: org });
  assert.equal(error, null);
  const due = async (orgId: string) => (await admin.from("wa_conversations").select("*", { count: "exact", head: true }).eq("org_id", orgId).not("next_followup_at", "is", null)).count;
  assert.equal(await due(org), 0);
  assert.equal(await due(other), 1);
});

test("F11: concurrent enabling still serialises (exactly the allowed number succeed)", async () => {
  const u = await makeUser();
  const org = await makeOrg(u, "starter");
  const results = await Promise.all(Array.from({ length: 10 }, () => addAccount(u, org)));
  assert.equal(results.filter((r) => !r.error).length, 2);
  assert.ok(results.filter((r) => r.error).every((r) => /plan limit: ad_accounts/.test(r.error!.message)));
});
