import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRobotsTagHeaderValue,
  getSiteRobotsMetadata,
  getSiteRobotsRules,
  isSearchIndexingEnabled,
} from "@/lib/site-indexing";

const ORIGINAL_ENV = { ...process.env };

describe("site indexing", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SITE_INDEXABLE;
    delete process.env.BASEBUDDY_SITE_INDEXABLE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults demo deployments to noindex when NEXT_PUBLIC_SITE_INDEXABLE is unset", () => {
    expect(isSearchIndexingEnabled()).toBe(false);
    expect(getRobotsTagHeaderValue()).toBe("noindex, nofollow, noarchive, nosnippet, noimageindex");
    expect(getSiteRobotsMetadata()).toMatchObject({
      follow: false,
      index: false,
      nocache: true,
    });
    expect(getSiteRobotsRules()).toEqual({
      rules: {
        disallow: "/",
        userAgent: "*",
      },
    });
  });

  it("allows indexing only when NEXT_PUBLIC_SITE_INDEXABLE is explicitly true", () => {
    process.env.NEXT_PUBLIC_SITE_INDEXABLE = "true";

    expect(isSearchIndexingEnabled()).toBe(true);
    expect(getRobotsTagHeaderValue()).toBeNull();
    expect(getSiteRobotsMetadata()).toMatchObject({
      follow: true,
      index: true,
    });
    expect(getSiteRobotsRules()).toEqual({
      rules: {
        allow: "/",
        userAgent: "*",
      },
    });
  });

  it("reads BASEBUDDY_SITE_INDEXABLE at call time and prefers it over the legacy name", () => {
    process.env.NEXT_PUBLIC_SITE_INDEXABLE = "true";
    process.env.BASEBUDDY_SITE_INDEXABLE = "false";
    expect(isSearchIndexingEnabled()).toBe(false);

    process.env.BASEBUDDY_SITE_INDEXABLE = "yes";
    expect(isSearchIndexingEnabled()).toBe(true);
    expect(getRobotsTagHeaderValue()).toBeNull();
  });
});
