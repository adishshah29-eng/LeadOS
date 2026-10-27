import type { MetadataRoute } from "next";
import { siteOrigin, sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteOrigin());
}
