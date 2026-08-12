import { describe, expect, it } from "vitest";

import { getBaseBuddyBranding } from "@/lib/branding";

describe("BaseBuddy branding", () => {
  it("uses production-safe defaults when no branding env is configured", () => {
    expect(getBaseBuddyBranding({})).toEqual({
      appName: "BaseBuddy",
      docsUrl: "https://basebuddy.version127.com/docs",
      supportUrl: "https://basebuddy.version127.com/support",
    });
  });

  it("uses build-time public branding values when provided", () => {
    expect(
      getBaseBuddyBranding({
        NEXT_PUBLIC_BASEBUDDY_APP_NAME: "Studio CMS",
        NEXT_PUBLIC_BASEBUDDY_DOCS_URL: "https://docs.example.com",
        NEXT_PUBLIC_BASEBUDDY_SUPPORT_URL: "https://support.example.com",
      }),
    ).toEqual({
      appName: "Studio CMS",
      docsUrl: "https://docs.example.com",
      supportUrl: "https://support.example.com",
    });
  });
});
