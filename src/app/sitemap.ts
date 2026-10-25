import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
}
