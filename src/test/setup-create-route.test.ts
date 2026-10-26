import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/setup/route";
import { getBaseBuddyConfigPath } from "@/lib/basebuddy-config/paths";

const setupPayload = {
  ownerEmail: "owner@example.com",
  ownerName: "Owner User",
  ownerPassword: "OwnerPass1!",
};

const createSetupRequest = (payload: unknown) =>
  new Request("http://localhost/api/setup", {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      "x-basebuddy-setup-token": "test-setup-token-at-least-32-characters",
    },
    method: "POST",
  });

const readSavedConfig = async () =>
  JSON.parse(await readFile(getBaseBuddyConfigPath(), "utf8"));

describe("setup create route", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "basebuddy-setup-route-"));
    process.chdir(tempDir);
    vi.stubEnv("BASEBUDDY_AUTH_SECRET", "env-auth-secret-value-with-32-plus-chars");
    vi.stubEnv("BASEBUDDY_SETUP_TOKEN", "test-setup-token-at-least-32-characters");
    vi.stubEnv(
      "BASEBUDDY_CONTENT_DATABASE_URL",
      "postgresql://content-user:db-pass@example.com:5432/postgres",
    );
    vi.stubEnv("BASEBUDDY_SUPABASE_PUBLISHABLE_KEY", "storage-publishable-key");
    vi.stubEnv("BASEBUDDY_SUPABASE_SECRET_KEY", "storage-secret-key");
    vi.stubEnv("BASEBUDDY_SUPABASE_URL", "https://storage.supabase.co");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
  });

  it("creates the BaseBuddy data config and first owner without storing env secrets", async () => {
    const response = await POST(createSetupRequest(setupPayload));
    const body = await response.json();
    const savedConfig = await readSavedConfig();
    const serializedBody = JSON.stringify(body);
    const serializedConfig = JSON.stringify(savedConfig);

    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.status.configPath).toBe(getBaseBuddyConfigPath());
    expect(savedConfig.install.content).toEqual({
      provider: "postgres",
    });
    expect(serializedConfig).not.toContain("BASEBUDDY_AUTH_SECRET");
    expect(serializedConfig).not.toContain("env-auth-secret-value-with-32-plus-chars");
    expect(serializedConfig).not.toContain("db-pass");
    expect(serializedConfig).not.toContain("storage-secret-key");
    expect(serializedConfig).not.toContain("storage-publishable-key");
    expect(savedConfig.users).toHaveLength(1);
    expect(savedConfig.users[0]).toMatchObject({
      avatarUrl: null,
      email: "owner@example.com",
      name: "Owner User",
      passwordHashParams: {
        keyLength: 64,
        name: "scrypt",
      },
    });
    expect(savedConfig.users[0].passwordHash).not.toBe(setupPayload.ownerPassword);
    expect(serializedConfig).not.toContain(setupPayload.ownerPassword);
    expect(serializedBody).not.toContain(setupPayload.ownerPassword);
    expect(serializedBody).not.toContain("db-pass");
    expect(serializedBody).not.toContain("storage-secret-key");
    expect(existsSync(join(tempDir, ".basebuddy"))).toBe(false);
  });

  it("rejects first-owner creation without the server setup credential", async () => {
    const request = createSetupRequest(setupPayload);
    request.headers.delete("x-basebuddy-setup-token");
    request.headers.delete("origin");
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);
  });

  it("rejects an incorrect setup credential", async () => {
    const request = createSetupRequest(setupPayload);
    request.headers.set("x-basebuddy-setup-token", "wrong");
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("can create setup from env values written to .env.local after the server starts", async () => {
    vi.unstubAllEnvs();
    await writeFile(
      join(tempDir, ".env.local"),
      [
        "BASEBUDDY_AUTH_SECRET=file-auth-secret-value-with-32-plus-chars",
        "BASEBUDDY_SETUP_TOKEN=test-setup-token-at-least-32-characters",
        "BASEBUDDY_CONTENT_DATABASE_URL=postgresql://file-user:file-pass@example.com:5432/postgres",
        "",
      ].join("\n"),
      "utf8",
    );

    const response = await POST(createSetupRequest(setupPayload));
    const body = await response.json();
    const savedConfig = await readSavedConfig();
    const serializedBody = JSON.stringify(body);
    const serializedConfig = JSON.stringify(savedConfig);

    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(savedConfig.users).toHaveLength(1);
    expect(serializedConfig).not.toContain("file-auth-secret-value-with-32-plus-chars");
    expect(serializedConfig).not.toContain("file-pass");
    expect(serializedBody).not.toContain("file-auth-secret-value-with-32-plus-chars");
    expect(serializedBody).not.toContain("file-pass");
  });

  it("refuses to overwrite an install that already has an owner", async () => {
    await POST(createSetupRequest(setupPayload));

    const response = await POST(
      createSetupRequest({
        ...setupPayload,
        ownerEmail: "second-owner@example.com",
      }),
    );
    const body = await response.json();
    const savedConfig = await readSavedConfig();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already has an owner user/i);
    expect(savedConfig.users).toHaveLength(1);
    expect(savedConfig.users[0].email).toBe("owner@example.com");
  });

  it("rejects oversized setup bodies before writing config", async () => {
    const response = await POST(
      new Request("http://localhost/api/setup", {
        body: JSON.stringify({
          ...setupPayload,
          ownerName: "x".repeat(10_000),
        }),
        headers: {
          "Content-Type": "application/json",
          host: "localhost",
          origin: "http://localhost",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(413);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);
  });

  it("rejects cross-origin setup creation", async () => {
    const response = await POST(
      new Request("http://localhost/api/setup", {
        body: JSON.stringify(setupPayload),
        headers: {
          "Content-Type": "application/json",
          host: "localhost",
          origin: "https://evil.example",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);
  });

  it("requires env credentials before creating the first owner", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("BASEBUDDY_SETUP_TOKEN", "test-setup-token-at-least-32-characters");

    const response = await POST(createSetupRequest(setupPayload));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/environment/i);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);
  });

  it("rejects invalid owner email and weak owner passwords before writing config", async () => {
    const invalidEmailResponse = await POST(
      createSetupRequest({
        ...setupPayload,
        ownerEmail: "owner",
      }),
    );
    const invalidEmailBody = await invalidEmailResponse.json();

    expect(invalidEmailResponse.status).toBe(400);
    expect(invalidEmailBody.error).toMatch(/real email/i);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);

    const weakPasswordResponse = await POST(
      createSetupRequest({
        ...setupPayload,
        ownerPassword: "password",
      }),
    );
    const weakPasswordBody = await weakPasswordResponse.json();

    expect(weakPasswordResponse.status).toBe(400);
    expect(weakPasswordBody.error).toMatch(/uppercase/i);
    expect(weakPasswordBody.error).toMatch(/number/i);
    expect(weakPasswordBody.error).toMatch(/symbol/i);
    expect(existsSync(getBaseBuddyConfigPath())).toBe(false);
  });
});
