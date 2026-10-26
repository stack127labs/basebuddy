import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("next config startup", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BASEBUDDY_SUPABASE_URL;
    delete process.env.BASEBUDDY_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.BASEBUDDY_SUPABASE_SECRET_KEY;
    delete process.env.BASEBUDDY_CONTENT_DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("lets the app boot far enough to render setup diagnostics without install env", async () => {
    const config = await import("../../next.config");

    expect(config.default.env).toEqual({ BASEBUDDY_TEST_BUILD: "0" });
  });
});
