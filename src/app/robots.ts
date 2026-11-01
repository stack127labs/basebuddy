import type { MetadataRoute } from "next";

import { getSiteRobotsRules } from "@/lib/site-indexing";

// Indexing is configured by runtime env, so robots.txt must not be built statically.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return getSiteRobotsRules();
}
