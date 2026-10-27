import type { MetadataRoute } from "next";
import { GUIDES } from "./guides.ts";
import { ALL_POSTS } from "../content/blog/index.ts";
import { activeCategories, publishedPosts } from "./blog.ts";

const PUBLIC_PAGES = ["", "/help", "/privacy", "/terms", "/data-deletion", "/blogs"];
const PRIVATE = ["/o/", "/admin", "/api/", "/r/", "/account", "/onboarding", "/invite/", "/reset-password", "/app", "/login/verify", "/setup", "/auth/", "/suspended"];

/** Just scheme + host, so stray spaces, slashes, queries or fragments never reach a link. */
const trim = (base: string) => new URL(base.trim()).origin;

/** The site's address for links and canonical URLs: NEXT_PUBLIC_SITE_URL, or local dev when unset. */
export const siteOrigin = (raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL) => trim(raw?.trim() || "http://localhost:3000");

export function robotsRules(base: string): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE }, sitemap: `${trim(base)}/sitemap.xml` };
}

export function sitemapEntries(base: string): MetadataRoute.Sitemap {
  const origin = trim(base);
  const staticUrls: MetadataRoute.Sitemap = [
    ...PUBLIC_PAGES,
    ...GUIDES.map((g) => `/help/${g.slug}`),
    ...activeCategories(ALL_POSTS).map((c) => `/blogs/category/${c}`),
  ].map((path) => ({ url: `${origin}${path}` }));

  const blogUrls: MetadataRoute.Sitemap = publishedPosts(ALL_POSTS).map((p) => ({
    url: `${origin}/blogs/${p.slug}`,
    lastModified: new Date(p.updatedOn ?? p.publishedOn),
  }));

  return [...staticUrls, ...blogUrls];
}
