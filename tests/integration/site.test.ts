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
