import { describe, expect, it } from "vitest";

import { getDemoDomainRedirect } from "@/lib/domain-migration";

describe("BaseBuddy demo domain migration", () => {
  it("permanently maps the legacy demo host to the matching stack127 URL", () => {
    const redirect = getDemoDomainRedirect(
      new URL("http://demo.basebuddycms.com/projects/demo?tab=posts"),
      "demo.basebuddycms.com:443",
    );

    expect(redirect?.toString()).toBe(
      "https://basebuddy-demo.stack127.com/projects/demo?tab=posts",
    );
  });

  it("does not redirect the new hostname", () => {
    expect(
      getDemoDomainRedirect(
        new URL("https://basebuddy-demo.stack127.com/login"),
        "basebuddy-demo.stack127.com",
      ),
    ).toBeNull();
  });
});
