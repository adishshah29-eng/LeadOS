// Integration tests against the running app and its real database.
// Start the app first (npm run dev), then: npm run test:int
// BASE_URL defaults to http://localhost:3000.
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const get = (path: string) => fetch(`${BASE}${path}`, { redirect: "manual" });

test("I1: /api/health reports a healthy database", async () => {
  const res = await get("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("I2: /api/health needs no sign-in (no redirect to /login)", async () => {
  const res = await get("/api/health");
  assert.equal(res.headers.get("location"), null);
  assert.equal(res.status, 200);
});

test("I3: /robots.txt blocks private areas and links the sitemap", async () => {
  const res = await get("/robots.txt");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Disallow: \/o\//);
  assert.match(text, /Sitemap: .*\/sitemap\.xml/);
});

test("I4: /sitemap.xml lists the help guides", async () => {
  const res = await get("/sitemap.xml");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\/help\/connect-meta<\/loc>/);
});

test("I5: the dev server sends no HSTS", async () => {
  for (const path of ["/", "/robots.txt", "/api/health"]) {
    assert.equal((await get(path)).headers.get("strict-transport-security"), null, path);
  }
});

test("I6: only /api/health itself skips the sign-in check, not look-alikes", async () => {
  for (const path of ["/api/healthz", "/api/health-admin", "/api/health/x"]) {
    const res = await get(path);
    assert.equal(res.status, 307, path);
    assert.match(res.headers.get("location") ?? "", /\/login/, path);
  }
});

test("I7: /data-deletion explains the self-serve steps", async () => {
  const res = await get("/data-deletion");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Danger zone/);
  assert.match(html, /Delete my account/);
});

test("I9 + I10: report links allow 300 opens a minute per address; the next is told to wait; other addresses aren't affected", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`; // a documentation-range address, unique per run
  const other = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const open = (from: string) => fetch(`${BASE}/r/${"x".repeat(43)}`, { headers: { "x-forwarded-for": from } }).then((r) => r.text());
  try {
    // 300 page loads take minutes here, longer than the 1-minute window; start the count at 299 instead.
    const { error } = await admin.from("rate_limits").insert({ key: `report:ip:${ip}`, count: 299, window_start: new Date().toISOString(), window_seconds: 60 });
    assert.equal(error, null, error?.message);
    assert.match(await open(ip), /isn.t available/, "the 300th open was refused");
    assert.match(await open(ip), /Too many requests/);
    assert.match(await open(other), /isn.t available/); // I10
  } finally {
    await admin.from("rate_limits").delete().in("key", [`report:ip:${ip}`, `report:ip:${other}`]);
  }
});
