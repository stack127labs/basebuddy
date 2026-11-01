import { describe, expect, it } from "vitest";

import { getBaseBuddyBranding } from "@/lib/branding";

describe("BaseBuddy branding", () => {
  it("uses production-safe defaults when no branding env is configured", () => {
    expect(getBaseBuddyBranding({})).toEqual({
      appName: "BaseBuddy",
      docsUrl: "https://basebuddy.stack127.com/docs",
      supportUrl: "https://basebuddy.stack127.com/support",
    });
  });

  it("prefers runtime BASEBUDDY_* branding values", () => {
    expect(
      getBaseBuddyBranding({
        BASEBUDDY_APP_NAME: "Runtime CMS",
        BASEBUDDY_DOCS_URL: "https://runtime-docs.example.com",
        BASEBUDDY_SUPPORT_URL: " ",
        NEXT_PUBLIC_BASEBUDDY_APP_NAME: "Legacy CMS",
        NEXT_PUBLIC_BASEBUDDY_SUPPORT_URL: "https://legacy-support.example.com",
      }),
    ).toEqual({
      appName: "Runtime CMS",
      docsUrl: "https://runtime-docs.example.com",
      supportUrl: "https://legacy-support.example.com",
    });
  });

  it("still accepts the legacy NEXT_PUBLIC_* branding names", () => {
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
