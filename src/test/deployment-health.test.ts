import { beforeEach, describe, expect, it, vi } from "vitest";

const { statusMock, readyMock } = vi.hoisted(() => ({ statusMock: vi.fn(), readyMock: vi.fn() }));
vi.mock("@/lib/basebuddy-config/setup", () => ({ getBaseBuddyConfigSetupStatus: statusMock, isBaseBuddyConfigSetupReady: readyMock }));
vi.mock("@/lib/api/request-guards", () => ({ enforceRateLimit: vi.fn().mockReturnValue(null) }));

describe("deployment health checks", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reports a running process without requiring setup or database access", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(statusMock).not.toHaveBeenCalled();
  });
  it("reports incomplete setup as not ready without returning credentials or diagnostics", async () => {
    statusMock.mockResolvedValue({ privateDetails: "must-not-be-returned" });
    readyMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET(new Request("http://localhost/api/ready"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false });
  });
  it("reports a configured app with a reachable database as ready", async () => {
    statusMock.mockResolvedValue({});
    readyMock.mockReturnValue(true);
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET(new Request("http://localhost/api/ready"));
    expect(response.status).toBe(200);
    expect(statusMock).toHaveBeenCalledWith({ checkContentDatabase: true });
  });
});
