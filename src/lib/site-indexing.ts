// Read at request time so one published Docker image can be configured by env.
// Bracket access keeps Next.js from inlining the legacy NEXT_PUBLIC_* value at build time.
const readSiteIndexableEnv = (env: Record<string, string | undefined> = process.env) => {
  const value = env["BASEBUDDY_SITE_INDEXABLE"];
  return value?.trim() ? value : env["NEXT_PUBLIC_SITE_INDEXABLE"];
};

export const isSearchIndexingEnabled = (rawValue = readSiteIndexableEnv()) => {
  const normalizedValue = rawValue?.trim().toLowerCase();
  return normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
};

export const getRobotsTagHeaderValue = (searchIndexingEnabled = isSearchIndexingEnabled()) =>
  searchIndexingEnabled ? null : "noindex, nofollow, noarchive, nosnippet, noimageindex";

export const getSiteRobotsMetadata = (searchIndexingEnabled = isSearchIndexingEnabled()) =>
  searchIndexingEnabled
    ? {
        follow: true,
        index: true,
      }
    : {
        follow: false,
        googleBot: {
          follow: false,
          index: false,
          noimageindex: true,
        },
        index: false,
        nocache: true,
      };

export const getSiteRobotsRules = (searchIndexingEnabled = isSearchIndexingEnabled()) =>
  searchIndexingEnabled
    ? {
        rules: {
          allow: "/",
          userAgent: "*",
        },
      }
    : {
        rules: {
          disallow: "/",
          userAgent: "*",
        },
      };
