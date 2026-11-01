import type { NextConfig } from "next";
import { getRobotsTagHeaderValue } from "./src/lib/site-indexing";
import { getSecurityHeaders } from "./src/lib/security/headers";

const isProduction = process.env.NODE_ENV === "production";
const securityHeaders = getSecurityHeaders({
  includeContentSecurityPolicy: false,
  isProduction,
  // Page X-Robots-Tag is set by middleware from runtime env; these headers are fixed at build time.
  searchIndexingEnabled: true,
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
      {
        // API responses are never meant for search engines, whatever the page setting is.
        headers: [{ key: "X-Robots-Tag", value: getRobotsTagHeaderValue(false) ?? "noindex" }],
        source: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
