import type { MetadataRoute } from "next";
import { robotsRules, siteOrigin } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteOrigin());
}
