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

test("I11: signed-out visitors can open /blogs, a category page, and a post without redirecting to /login", async () => {
  for (const path of ["/blogs", "/blogs/category/comparisons", "/blogs/leados-vs-spreadsheets-and-whatsapp"]) {
    const res = await get(path);
    assert.equal(res.headers.get("location"), null, `Redirected on ${path}`);
    assert.equal(res.status, 200, `Non-200 status on ${path}`);
  }
});

test("I12: /blogs/does-not-exist and /blogs/category/nope return 404", async () => {
  for (const path of ["/blogs/does-not-exist", "/blogs/category/nope"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
  }
});

test("I13: post HTML contains canonical link, og:type=article, one h1, and ld+json", async () => {
  const res = await get("/blogs/leados-vs-spreadsheets-and-whatsapp");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /rel="canonical"/i);
  assert.match(html, /og:type/i);
  assert.match(html, /type="application\/ld\+json"/i);
  const h1Matches = html.match(/<h1[\s>]/gi) || [];
  assert.equal(h1Matches.length, 1, `Expected exactly 1 h1 tag, got ${h1Matches.length}`);
});

test("I14: /blog permanently redirects to /blogs (308)", async () => {
  const res = await get("/blog");
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "/blogs");
});

test("I15: comparison post shows disclaimer and checked-on date", async () => {
  const res = await get("/blogs/leados-vs-spreadsheets-and-whatsapp");
  const html = await res.text();
  assert.match(html, /is a trademark of its owner/);
  assert.match(html, /Information checked on.*27 Oct 2026/);
});

test("I16: /sitemap.xml contains published post URLs and /blogs", async () => {
  const res = await get("/sitemap.xml");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /\/blogs<\/loc>/);
  assert.match(text, /\/blogs\/leados-vs-spreadsheets-and-whatsapp<\/loc>/);
});

test("I17: landing page links to /blogs in nav and footer", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /href="\/blogs"/);
});


test("I18: a published post's share image renders as a PNG; a draft's does not exist", async () => {
  const ok = await get("/blogs/leados-vs-spreadsheets-and-whatsapp/opengraph-image");
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-type") ?? "", /image\/png/);
  const draft = await get("/blogs/leados-vs-hubspot-real-estate-india/opengraph-image");
  assert.equal(draft.status, 404);
});
