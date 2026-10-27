import { test } from "node:test";
import assert from "node:assert/strict";
import { robotsRules, sitemapEntries } from "./seo.ts";
import { GUIDES } from "./guides.ts";

const PRIVATE = ["/o/", "/admin", "/api/", "/r/", "/account", "/onboarding", "/invite/", "/reset-password"];

test("U14: robots allows the public site, blocks private areas, points to the sitemap", () => {
  const r = robotsRules("https://leados.example");
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  assert.equal(rule.allow, "/");
  for (const p of PRIVATE) assert.ok((rule.disallow as string[]).includes(p), p);
  assert.ok(!(rule.disallow as string[]).includes("/blogs"), "/blogs should not be disallowed");
  assert.equal(r.sitemap, "https://leados.example/sitemap.xml");
});

test("U13: sitemapEntries includes /blogs, every category and each published post with lastModified; no drafts", () => {
  const entries = sitemapEntries("https://leados.example");
  const urls = entries.map((e) => e.url);
  assert.ok(urls.includes("https://leados.example/blogs"), "missing /blogs");
  assert.ok(urls.includes("https://leados.example/blogs/category/comparisons"), "missing category");
  assert.ok(urls.includes("https://leados.example/blogs/leados-vs-spreadsheets-and-whatsapp"), "missing post");
  
  const postEntry = entries.find((e) => e.url === "https://leados.example/blogs/leados-vs-spreadsheets-and-whatsapp");
  assert.ok(postEntry?.lastModified instanceof Date, "lastModified is not Date");
});

test("U15: sitemap lists every public page as a full URL, nothing private", () => {
  const urls = sitemapEntries("https://leados.example").map((e) => e.url);
  for (const path of ["", "/help", "/privacy", "/terms", "/data-deletion", ...GUIDES.map((g) => `/help/${g.slug}`)]) {
    assert.ok(urls.includes(`https://leados.example${path}`), path || "home");
  }
  for (const u of urls) assert.ok(!PRIVATE.some((p) => new URL(u).pathname.startsWith(p.replace(/\/$/, ""))), u);
});

test("U16: a trailing slash on the site URL gives no double slashes", () => {
  const base = "https://leados.example/";
  assert.equal(robotsRules(base).sitemap, "https://leados.example/sitemap.xml");
  for (const e of sitemapEntries(base)) assert.ok(!e.url.replace("https://", "").includes("//"), e.url);
});

test("F5: links are built from the site's origin, whatever the raw setting looks like", () => {
  for (const base of [" https://leados.example ", "https://LEADOS.example/", "https://leados.example/?x=1#y"]) {
    assert.equal(robotsRules(base).sitemap, "https://leados.example/sitemap.xml", base);
    assert.ok(sitemapEntries(base).every((e) => e.url.startsWith("https://leados.example") && !/[\s?#]/.test(e.url)), base);
  }
});

test("F8: robots also blocks the sign-in helper and status pages", () => {
  const rule = robotsRules("https://leados.example").rules;
  const disallow = (Array.isArray(rule) ? rule[0] : rule).disallow as string[];
  for (const p of ["/app", "/login/verify", "/setup", "/auth/", "/suspended"]) assert.ok(disallow.includes(p), p);
});

test("T3: one site address for every page: the setting's origin, or localhost when unset", async () => {
  const { siteOrigin } = await import("./seo.ts");
  assert.equal(siteOrigin(undefined), "http://localhost:3000");
  assert.equal(siteOrigin(""), "http://localhost:3000");
  assert.equal(siteOrigin(" https://leados.example/blog?x=1 "), "https://leados.example");
});
