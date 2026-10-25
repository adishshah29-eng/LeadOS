// Self-serve deletion against the real dev database (needs migration 0007).
// Creates throwaway users on @example.test and removes everything afterwards.
// Run: npm run test:int  (reads .env.local)
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SECRET, opts);
const rand = () => crypto.randomBytes(6).toString("hex");

type User = { id: string; email: string; password: string; db: SupabaseClient };
const users: User[] = [];
const createdOrgs: string[] = []; // every workspace a test makes, removed in after() even if a check fails

async function makeUser(): Promise<User> {
  const email = `leados-test-${rand()}@example.test`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const db = createClient(URL_, ANON, opts);
  const { error: e2 } = await db.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const u = { id: data.user.id, email, password, db };
  users.push(u);
  return u;
}

async function makeOrg(owner: User, name = `Test Realty ${rand()}`) {
  const slug = `t-${rand()}`;
  const { error } = await owner.db.rpc("create_organization", { p_name: name, p_slug: slug });
  if (error) throw error;
  const { data } = await admin.from("organizations").select("id").eq("slug", slug).single();
  createdOrgs.push(data!.id as string);
  return { id: data!.id as string, name, slug };
}

const addMember = async (orgId: string, u: User, role = "admin") => {
  const { error } = await admin.from("memberships").insert({ org_id: orgId, user_id: u.id, role });
  if (error) throw error;
};

/** One row in every table a workspace owns, plus a real Vault secret. Returns the secret ids. */
async function seedEverything(orgId: string, owner: User, member: User): Promise<string[]> {
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert(row).select().maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Record<string, unknown> | null;
  };
  const project = await ins("projects", { org_id: orgId, name: "Skyline" });
  await ins("project_members", { org_id: orgId, project_id: project!.id, user_id: member.id });
  await ins("invitations", { org_id: orgId, email: `inv-${rand()}@example.test`, role: "agent", token_hash: rand() + rand() });
  const lead = await ins("leads", { org_id: orgId, name: "Test Lead", project_id: project!.id });
  await ins("lead_events", { org_id: orgId, lead_id: lead!.id, type: "note", payload: { text: "hi" } });
  const account = await ins("ad_accounts", { org_id: orgId, meta_account_id: `act_${rand()}`, name: "Acct", project_id: project!.id });
  await ins("ad_daily", { org_id: orgId, ad_account_id: account!.id, date: "2026-10-01", ad_id: "1", spend: 10 });
  await ins("ad_entities", { org_id: orgId, ad_account_id: account!.id, level: "ad", entity_id: rand(), name: "Ad" });
  await ins("ad_rollup_daily", { org_id: orgId, project_id: project!.id, level: "project", entity_id: String(project!.id), date: "2026-10-01" });
  await ins("meta_pages", { org_id: orgId, page_id: String(Date.now()) + String(Math.floor(Math.random() * 1e6)), name: "Page" });
  await ins("report_links", { org_id: orgId, label: "Client", token_hash: rand() + rand(), expires_at: new Date(Date.now() + 864e5).toISOString(), created_by: owner.id });
  await ins("bot_settings", { org_id: orgId });
  const conv = await ins("wa_conversations", { org_id: orgId, lead_id: lead!.id, phone: "919000000001" });
  await ins("wa_messages", { org_id: orgId, conversation_id: conv!.id, direction: "in", kind: "text", body: "hi" });
  await ins("llm_usage", { org_id: orgId, ok: true });
  await ins("sync_runs", { org_id: orgId, kind: "ads" });
  await ins("webhook_events", { kind: "test", dedupe_key: rand(), org_id: orgId, payload: {} });
  // A real Vault secret, stored the way the app stores it (also writes an audit_log row).
  const { error } = await owner.db.rpc("connect_meta", { p_org: orgId, p_token: "test-token-" + rand() + rand(), p_display_name: "Test", p_scopes: [], p_available: {} });
  if (error) throw new Error(`connect_meta: ${error.message}`);
  const { data } = await admin.from("integrations").select("vault_secret_id").eq("org_id", orgId);
  return (data ?? []).map((r) => r.vault_secret_id as string).filter(Boolean);
}

const ORG_TABLES = [
  "projects", "project_members", "memberships", "invitations", "leads", "lead_events", "ad_accounts", "ad_daily",
  "ad_entities", "ad_rollup_daily", "meta_pages", "integrations", "report_links", "bot_settings", "wa_conversations",
  "wa_messages", "llm_usage", "sync_runs", "webhook_events", "audit_log",
];

async function counts(orgId: string) {
  const out: Record<string, number> = {};
  for (const t of ORG_TABLES) {
    const { count, error } = await admin.from(t).select("*", { count: "exact", head: true }).eq("org_id", orgId);
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = count ?? 0;
  }
  const { count } = await admin.from("organizations").select("*", { count: "exact", head: true }).eq("id", orgId);
  out.organizations = count ?? 0;
  return out;
}

const vaultLeft = async (ids: string[]) => {
  const { data, error } = await admin.rpc("worker_vault_secrets_exist", { p_ids: ids });
  if (error) throw error;
  return data as number;
};

const orgExists = async (id: string) => (await counts(id)).organizations === 1;

let owner: User, adminMember: User, outsider: User;
let org: { id: string; name: string }, otherOrg: { id: string; name: string };
let secretIds: string[] = [];

before(async () => {
  owner = await makeUser();
  adminMember = await makeUser();
  outsider = await makeUser();
  org = await makeOrg(owner);
  await addMember(org.id, adminMember, "admin");
  secretIds = await seedEverything(org.id, owner, adminMember);
  otherOrg = await makeOrg(outsider);
  await seedEverything(otherOrg.id, outsider, outsider);
});

after(async () => {
  // purge_organization also erases each workspace's Vault secrets, so no test data is left behind.
  for (const id of createdOrgs) await admin.rpc("purge_organization", { p_org: id });
  for (const u of users) await admin.auth.admin.deleteUser(u.id).catch(() => {});
});

test("D1: the owner with the wrong name deletes nothing", async () => {
  const { error } = await owner.db.rpc("delete_organization", { p_org: org.id, p_confirm_name: org.name.toLowerCase() });
  assert.match(error?.message ?? "", /name does not match/);
  assert.equal(await orgExists(org.id), true);
});

test("D2: an admin who isn't the owner is refused", async () => {
  const { error } = await adminMember.db.rpc("delete_organization", { p_org: org.id, p_confirm_name: org.name });
  assert.match(error?.message ?? "", /only the owner/);
  assert.equal(await orgExists(org.id), true);
});

test("D3: the owner of another workspace is refused", async () => {
  const { error } = await outsider.db.rpc("delete_organization", { p_org: org.id, p_confirm_name: org.name });
  assert.match(error?.message ?? "", /only the owner/);
  assert.equal(await orgExists(org.id), true);
});

test("D4: a signed-out request is refused", async () => {
  const anon = createClient(URL_, ANON, opts);
  const { error } = await anon.rpc("delete_organization", { p_org: org.id, p_confirm_name: org.name });
  assert.ok(error, "anonymous call succeeded");
  assert.equal(await orgExists(org.id), true);
});

test("D5–D7: the owner with the right name deletes everything, Vault included, and nothing else", async () => {
  const before = await counts(otherOrg.id);
  const seeded = await counts(org.id);
  for (const [t, n] of Object.entries(seeded)) assert.ok(n > 0, `seed missing for ${t}`);
  assert.equal(await vaultLeft(secretIds), secretIds.length, "seed has no Vault secret");

  const { error } = await owner.db.rpc("delete_organization", { p_org: org.id, p_confirm_name: `  ${org.name} ` });
  assert.equal(error, null);
  const left = await counts(org.id);
  for (const [t, n] of Object.entries(left)) assert.equal(n, 0, `rows left in ${t}`); // D5
  assert.equal(await vaultLeft(secretIds), 0, "Vault secret survived"); // D6
  assert.deepEqual(await counts(otherOrg.id), before); // D7
});

test("D8: deleting an account that owns a workspace with other members is refused", async () => {
  // outsider owns otherOrg, and adminMember is a member of it
  await addMember(otherOrg.id, adminMember, "agent");
  const { error } = await admin.rpc("delete_user_account", { p_uid: outsider.id });
  assert.match(error?.message ?? "", new RegExp(`owns workspace with members: ${otherOrg.name}`));
  const { data } = await admin.auth.admin.getUserById(outsider.id);
  assert.ok(data.user, "user was deleted anyway");
  assert.equal(await orgExists(otherOrg.id), true);
});

test("D9: deleting an account removes solo workspaces and memberships, keeps other workspaces", async () => {
  const solo = await makeUser();
  const soloOrg = await makeOrg(solo);
  const soloSecrets = await seedEverything(soloOrg.id, solo, solo);
  await addMember(otherOrg.id, solo, "agent");
  const otherBefore = (await counts(otherOrg.id)).memberships;

  const { error } = await admin.rpc("delete_user_account", { p_uid: solo.id });
  assert.equal(error, null);
  for (const [t, n] of Object.entries(await counts(soloOrg.id))) assert.equal(n, 0, `rows left in ${t}`);
  assert.equal(await vaultLeft(soloSecrets), 0);
  assert.equal(await orgExists(otherOrg.id), true);
  assert.equal((await counts(otherOrg.id)).memberships, otherBefore - 1);
  const { data } = await admin.auth.admin.getUserById(solo.id);
  assert.equal(data.user, null);
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("user_id", solo.id);
  assert.equal(count, 0);
});

test("D10: a signed-out account deletion is refused", async () => {
  const anon = createClient(URL_, ANON, opts);
  const { error } = await anon.rpc("delete_my_account");
  assert.ok(error, "anonymous call succeeded");
});

// ---------------------------------------------------------------- review fixes

const inviteAndJoin = async (inviter: User, orgId: string, invitee: User) => {
  const tokenHash = crypto.createHash("sha256").update(rand()).digest("hex");
  let r = await inviter.db.rpc("create_invitation", { p_org: orgId, p_email: invitee.email, p_role: "agent", p_token_hash: tokenHash });
  if (r.error) throw r.error;
  r = await invitee.db.rpc("accept_invitation", { p_token_hash: tokenHash });
  if (r.error) throw r.error;
};

test("F1: a signed-in session can't delete an account directly (no password re-check bypass)", async () => {
  const u = await makeUser();
  const own = await u.db.rpc("delete_my_account");
  assert.ok(own.error, "the old user-callable function still works");
  const direct = await u.db.rpc("delete_user_account", { p_uid: u.id });
  assert.ok(direct.error, "a signed-in user can call the server-only function");
  const { data } = await admin.auth.admin.getUserById(u.id);
  assert.ok(data.user, "the account was deleted");
});

test("F2a: a suspended workspace can't be deleted by its owner", async () => {
  const u = await makeUser();
  const o = await makeOrg(u);
  await admin.from("organizations").update({ status: "suspended" }).eq("id", o.id);
  const { error } = await u.db.rpc("delete_organization", { p_org: o.id, p_confirm_name: o.name });
  assert.match(error?.message ?? "", /suspended/);
  assert.equal(await orgExists(o.id), true);
  await admin.rpc("purge_organization", { p_org: o.id });
});

test("F2b: account deletion is refused while the user owns a suspended workspace", async () => {
  const u = await makeUser();
  const o = await makeOrg(u);
  await admin.from("organizations").update({ status: "suspended" }).eq("id", o.id);
  const { error } = await admin.rpc("delete_user_account", { p_uid: u.id });
  assert.match(error?.message ?? "", /suspended/);
  assert.equal(await orgExists(o.id), true);
  await admin.rpc("purge_organization", { p_org: o.id });
});

test("F2c: every deletion leaves a platform-only record (workspace and account)", async () => {
  const u = await makeUser();
  const o = await makeOrg(u);
  const del = await u.db.rpc("delete_organization", { p_org: o.id, p_confirm_name: o.name });
  assert.equal(del.error, null);
  const acc = await admin.rpc("delete_user_account", { p_uid: u.id });
  assert.equal(acc.error, null);
  const { data } = await admin.from("deletion_log").select("kind, subject_id, actor_id").in("subject_id", [o.id, u.id]);
  assert.deepEqual(
    (data ?? []).map((r) => `${r.kind}:${r.subject_id === o.id ? "org" : "user"}:${r.actor_id === u.id}`).sort(),
    ["account:user:true", "workspace:org:true"],
  );
  const readable = await u.db.from("deletion_log").select("*");
  assert.ok(readable.error || (readable.data ?? []).length === 0, "signed-in users can read the deletion log");
});

test("F4: a deleted user's email is removed from other workspaces' activity log and invitations", async () => {
  const host = await makeUser();
  const hostOrg = await makeOrg(host);
  const leaver = await makeUser();
  await inviteAndJoin(host, hostOrg.id, leaver);
  // a second, unaccepted invitation to the same address
  await host.db.rpc("create_invitation", { p_org: hostOrg.id, p_email: leaver.email.toUpperCase(), p_role: "viewer", p_token_hash: rand() + rand() });

  const { error } = await admin.rpc("delete_user_account", { p_uid: leaver.id });
  assert.equal(error, null);
  const { data: log } = await admin.from("audit_log").select("target").eq("org_id", hostOrg.id);
  assert.ok(!(log ?? []).some((r) => String(r.target ?? "").toLowerCase().includes(leaver.email)), "email left in activity log");
  const { count } = await admin.from("invitations").select("*", { count: "exact", head: true }).ilike("email", leaver.email);
  assert.equal(count, 0, "invitations to the deleted email remain");
  await admin.rpc("purge_organization", { p_org: hostOrg.id });
});

test("F6: a name pasted with tabs, line breaks or non-breaking spaces still matches", async () => {
  const u = await makeUser();
  const o = await makeOrg(u);
  const { error } = await u.db.rpc("delete_organization", { p_org: o.id, p_confirm_name: `\t\u00a0${o.name} \n` });
  assert.equal(error, null);
  assert.equal(await orgExists(o.id), false);
});

test("F7: an invite accepted while the owner deletes their account never leaves a wiped team (20 races)", async () => {
  for (let i = 0; i < 20; i++) {
    const owner = await makeUser();
    const o = await makeOrg(owner);
    const joiner = await makeUser();
    const tokenHash = crypto.createHash("sha256").update(rand()).digest("hex");
    const inv = await owner.db.rpc("create_invitation", { p_org: o.id, p_email: joiner.email, p_role: "agent", p_token_hash: tokenHash });
    if (inv.error) throw inv.error;
    const [del, acc] = await Promise.all([
      admin.rpc("delete_user_account", { p_uid: owner.id }),
      joiner.db.rpc("accept_invitation", { p_token_hash: tokenHash }),
    ]);
    // Never both: the owner's account deleted AND a member who joined that workspace.
    assert.ok(!(del.error === null && acc.error === null), `race ${i}: account deleted after a member joined`);
    await admin.rpc("purge_organization", { p_org: o.id });
  }
});
