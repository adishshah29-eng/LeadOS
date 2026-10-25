import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return robotsRules(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
}
