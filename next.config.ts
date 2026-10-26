import type { NextConfig } from "next";
import { isSearchIndexingEnabled } from "./src/lib/site-indexing";
import { getSecurityHeaders } from "./src/lib/security/headers";

const isProduction = process.env.NODE_ENV === "production";
const searchIndexingEnabled = isSearchIndexingEnabled(process.env.NEXT_PUBLIC_SITE_INDEXABLE);
const securityHeaders = getSecurityHeaders({
  includeContentSecurityPolicy: false,
  isProduction,
  searchIndexingEnabled,
  supabaseUrl: null,
});

const nextConfig: NextConfig = {
  env: { BASEBUDDY_TEST_BUILD: process.env.BASEBUDDY_TEST_BUILD === "1" ? "1" : "0" },
  experimental: {
    webpackBuildWorker: false,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/:path*",
      },
    ];
  },
};

export default nextConfig;
