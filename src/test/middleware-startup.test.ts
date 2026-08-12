import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextResponseNextMock = vi.hoisted(() => vi.fn());
const nextResponseRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  NextResponse: {
    next: nextResponseNextMock,
    redirect: nextResponseRedirectMock,
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("middleware startup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    nextResponseNextMock.mockImplementation(() => ({
      cookies: {
        set: vi.fn(),
      },
      headers: new Headers(),
      status: 200,
    }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("keeps CSP middleware independent from Supabase session refresh", async () => {
    const { middleware } = await import("../../src/middleware");

    const response = await middleware({
      cookies: {
        getAll: () => [],
        set: vi.fn(),
      },
      nextUrl: new URL("http://localhost/onboarding"),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(nextResponseNextMock).toHaveBeenCalledOnce();
  });

  it("attaches a production CSP nonce for Next inline scripts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { middleware } = await import("../../src/middleware");

    const response = await middleware({
      cookies: {
        getAll: () => [],
        set: vi.fn(),
      },
      headers: new Headers(),
      nextUrl: new URL("https://basebuddy.test/onboarding"),
    } as never);

    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("script-src 'self' 'nonce-");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("returns a permanent path-preserving redirect for the legacy demo host", async () => {
    nextResponseRedirectMock.mockReturnValue({ status: 308 });
    const { middleware } = await import("../../src/middleware");

    const response = await middleware({
      cookies: {
        getAll: () => [],
        set: vi.fn(),
      },
      headers: new Headers({ host: "demo.basebuddycms.com" }),
      nextUrl: new URL("http://demo.basebuddycms.com/projects/demo?tab=posts"),
    } as never);

    expect(response.status).toBe(308);
    expect(nextResponseRedirectMock).toHaveBeenCalledWith(
      new URL("https://demo.basebuddy.version127.com/projects/demo?tab=posts"),
      308,
    );
    expect(nextResponseNextMock).not.toHaveBeenCalled();
  });
});
