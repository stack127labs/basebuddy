import { scrypt } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getBaseBuddyConfigPath } from "@/lib/basebuddy-config/paths";
import {
  createDefaultBaseBuddyConfig,
  type BaseBuddyConfig,
} from "@/lib/basebuddy-config/schema";

const scryptAsync = promisify(scrypt);
const fixedNow = "2026-05-27T00:00:00.000Z";
const authSecret = "local-auth-secret-value-with-32-plus-chars";

const hashPasswordForTest = async (plainTextPassword: string, salt: string) =>
  ((await scryptAsync(plainTextPassword, salt, 64)) as Buffer).toString("base64url");

const readConfig = async () =>
  JSON.parse(await readFile(getBaseBuddyConfigPath(), "utf8")) as BaseBuddyConfig;

describe("Playwright test auth route", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    tempDir = await mkdtemp(join(tmpdir(), "basebuddy-test-auth-route-"));
    process.chdir(tempDir);
    vi.stubEnv("BASEBUDDY_AUTH_SECRET", authSecret);
    vi.stubEnv("BASEBUDDY_CONTENT_DATABASE_URL", "postgresql://content-user:db-pass@example.com:5432/postgres");
    const passwordSalt = "owner-password-salt";
    const config = createDefaultBaseBuddyConfig({
      now: fixedNow,
    });

    config.users.push({
      avatarUrl: null,
      createdAt: fixedNow,
      email: "owner@example.com",
      id: "user_owner",
      name: "Owner User",
      passwordHash: await hashPasswordForTest("password-123", passwordSalt),
      passwordHashParams: {
        keyLength: 64,
        name: "scrypt",
      },
      passwordSalt,
      updatedAt: fixedNow,
    });

    await writeFile(getBaseBuddyConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("stays unavailable in production even when test credentials are present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASEBUDDY_ENABLE_TEST_AUTH", "1");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");

    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(
      new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner&next=/projects"),
    );
    const config = await readConfig();

    expect(response.status).toBe(404);
    expect(config.sessions).toHaveLength(0);
  });

  it("stays unavailable in production when test flags are copied into a normal build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASEBUDDY_ENABLE_TEST_AUTH", "1");
    vi.stubEnv("BASEBUDDY_PLAYWRIGHT_RUNTIME", "1");
    vi.stubEnv("BASEBUDDY_TEST_BUILD", "0");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");
    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner"));
    expect(response.status).toBe(404);
    expect((await readConfig()).sessions).toHaveLength(0);
  });

  it("stays unavailable until the Playwright runtime flag is present", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BASEBUDDY_ENABLE_TEST_AUTH", "1");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");

    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(
      new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner&next=/projects"),
    );
    const config = await readConfig();

    expect(response.status).toBe(404);
    expect(config.sessions).toHaveLength(0);
  });

  it("stays unavailable outside production until test auth is explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");

    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(
      new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner&next=/projects"),
    );
    const config = await readConfig();

    expect(response.status).toBe(404);
    expect(config.sessions).toHaveLength(0);
  });

  it("creates a local config session for a Playwright role only when explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BASEBUDDY_ENABLE_TEST_AUTH", "1");
    vi.stubEnv("BASEBUDDY_PLAYWRIGHT_RUNTIME", "1");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");

    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(
      new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner&next=/projects"),
    );
    const config = await readConfig();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3100/projects");
    expect(response.headers.get("set-cookie")).toContain("basebuddy_session=");
    expect(config.sessions).toHaveLength(1);
    expect(JSON.stringify(config)).not.toContain("password-123");
  });

  it("allows production-mode Playwright smoke tests only inside the Playwright runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASEBUDDY_TEST_BUILD", "1");
    vi.stubEnv("BASEBUDDY_ENABLE_TEST_AUTH", "1");
    vi.stubEnv("BASEBUDDY_PLAYWRIGHT_RUNTIME", "1");
    vi.stubEnv("PLAYWRIGHT_BASE_URL", "http://localhost:3100");
    vi.stubEnv("PLAYWRIGHT_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("PLAYWRIGHT_OWNER_PASSWORD", "password-123");

    const { GET } = await import("@/app/api/test-auth/playwright-sign-in/route");
    const response = await GET(
      new NextRequest("http://localhost:3100/api/test-auth/playwright-sign-in?role=owner&next=/projects"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3100/projects");
    expect(response.headers.get("set-cookie")).toContain("basebuddy_session=");
  });
});
