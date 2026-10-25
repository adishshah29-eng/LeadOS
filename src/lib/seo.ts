import type { MetadataRoute } from "next";
import { GUIDES } from "./guides.ts";

const PUBLIC_PAGES = ["", "/help", "/privacy", "/terms", "/data-deletion"];
const PRIVATE = ["/o/", "/admin", "/api/", "/r/", "/account", "/onboarding", "/invite/", "/reset-password", "/app", "/login/verify", "/setup", "/auth/", "/suspended"];

/** Just scheme + host, so stray spaces, slashes, queries or fragments never reach a link. */
const trim = (base: string) => new URL(base.trim()).origin;

export function robotsRules(base: string): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE }, sitemap: `${trim(base)}/sitemap.xml` };
}

export function sitemapEntries(base: string): MetadataRoute.Sitemap {
  return [...PUBLIC_PAGES, ...GUIDES.map((g) => `/help/${g.slug}`)].map((path) => ({ url: `${trim(base)}${path}` }));
}
