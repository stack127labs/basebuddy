import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BASEBUDDY_CONFIG_DIRECTORY,
  BASEBUDDY_CONFIG_FILENAME,
  getBaseBuddyConfigPath,
} from "@/lib/basebuddy-config/paths";
import {
  baseBuddyConfigSchema,
  createDefaultBaseBuddyConfig,
  redactBaseBuddyConfig,
  type BaseBuddyConfig,
} from "@/lib/basebuddy-config/schema";
import {
  ensureBaseBuddyConfig,
  getRedactedBaseBuddyConfigStatus,
  loadBaseBuddyConfig,
  loadOptionalBaseBuddyConfig,
  writeBaseBuddyConfig,
} from "@/lib/basebuddy-config/store";

const fixedNow = "2026-05-27T00:00:00.000Z";
const authSecret = "local-auth-secret-value-with-32-plus-chars";

const createSeedConfig = () =>
  createDefaultBaseBuddyConfig({
    now: fixedNow,
  });

describe("BaseBuddy config store", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "basebuddy-config-store-"));
    process.chdir(tempDir);
    await mkdir(join(process.cwd(), "basebuddy-data"), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { force: true, recursive: true });
  });

  it("resolves the config file at process.cwd()/basebuddy-data/basebuddy.config.json", () => {
    expect(BASEBUDDY_CONFIG_DIRECTORY).toBe("basebuddy-data");
    expect(BASEBUDDY_CONFIG_FILENAME).toBe("basebuddy.config.json");
    expect(getBaseBuddyConfigPath()).toBe(
      join(process.cwd(), "basebuddy-data", "basebuddy.config.json"),
    );
  });

  it("returns null when the config file is missing", async () => {
    await expect(loadOptionalBaseBuddyConfig()).resolves.toBeNull();
  });

  it("fails with a clear message when the config file is invalid JSON", async () => {
    await writeFile(getBaseBuddyConfigPath(), "{not-json", "utf8");

    await expect(loadBaseBuddyConfig()).rejects.toThrow(
      /Could not parse BaseBuddy config file/,
    );
  });

  it("fails with a clear message when the config shape is invalid", async () => {
    await writeFile(
      getBaseBuddyConfigPath(),
      JSON.stringify({ projects: [] }),
      "utf8",
    );

    await expect(loadBaseBuddyConfig()).rejects.toThrow(
      /BaseBuddy config file is invalid/,
    );
  });

  it("creates a default config that validates against the schema", () => {
    const config = createSeedConfig();

    expect(baseBuddyConfigSchema.parse(config)).toEqual(config);
    expect(config).toMatchObject({
      invitations: [],
      install: {
        content: {
          provider: "postgres",
        },
      },
      projects: [],
      sessions: [],
      users: [],
      version: 1,
    });
    expect(JSON.stringify(config)).not.toContain("authSecret");
    expect(JSON.stringify(config)).not.toContain("databaseUrl");
    expect(JSON.stringify(config)).not.toContain("supabaseSecretKey");
    expect(JSON.stringify(config)).not.toContain("secretAccessKey");
  });

  it("creates the config file when setup ensures it", async () => {
    const config = await ensureBaseBuddyConfig({
      now: fixedNow,
    });
    const savedConfig = JSON.parse(await readFile(getBaseBuddyConfigPath(), "utf8"));

    expect(savedConfig).toEqual(config);
    expect(savedConfig.version).toBe(1);
    expect(savedConfig.projects).toEqual([]);
  });

  it("writes validated config updates atomically", async () => {
    await ensureBaseBuddyConfig({
      now: fixedNow,
    });

    const nextConfig = await writeBaseBuddyConfig((config) => ({
      ...config,
      projects: [
        ...config.projects,
        {
          createdAt: fixedNow,
          createdBy: "user_1",
          id: "project_1",
          mapping: null,
          mappingRevisions: [],
          members: [],
          name: "Docs Project",
          sidebar: null,
          sidebarRevisions: [],
          slug: "docs-project",
          status: "active",
          updatedAt: fixedNow,
          websiteUrl: null,
        },
      ],
    }));

    const rawConfig = await readFile(getBaseBuddyConfigPath(), "utf8");

    expect(JSON.parse(rawConfig)).toEqual(nextConfig);
    expect(nextConfig.projects).toHaveLength(1);
  });

  it("keeps the previous config when an update returns an invalid shape", async () => {
    const originalConfig = await ensureBaseBuddyConfig({
      now: fixedNow,
    });

    await expect(
      writeBaseBuddyConfig(
        (config) =>
          ({
            ...config,
            version: 999,
          }) as unknown as BaseBuddyConfig,
      ),
    ).rejects.toThrow(/BaseBuddy config file is invalid/);

    await expect(loadBaseBuddyConfig()).resolves.toEqual(originalConfig);
  });

  it("serializes concurrent writes through one process-local queue", async () => {
    await ensureBaseBuddyConfig({
      now: fixedNow,
    });

    await Promise.all(
      Array.from({ length: 5 }, (_value, index) =>
        writeBaseBuddyConfig((config) => ({
          ...config,
          users: [
            ...config.users,
            {
              avatarUrl: null,
              createdAt: fixedNow,
              email: `user-${index}@example.com`,
              id: `user_${index}`,
              name: `User ${index}`,
              passwordHash: `hash-${index}`,
              passwordSalt: `salt-${index}`,
              passwordHashParams: {
                keyLength: 64,
                name: "scrypt",
              },
              updatedAt: fixedNow,
            },
          ],
        })),
      ),
    );

    const config = await loadBaseBuddyConfig();

    expect(config.users.map((user) => user.email).sort()).toEqual([
      "user-0@example.com",
      "user-1@example.com",
      "user-2@example.com",
      "user-3@example.com",
      "user-4@example.com",
    ]);
  });

  it("rejects legacy config shapes that try to store connection or signing secrets", () => {
    const legacySecretBearingConfig = {
      ...createSeedConfig(),
      install: {
        ...createSeedConfig().install,
        authSecret,
        content: {
          databaseUrl: "postgresql://db-user:db-pass@example.com:5432/postgres",
          provider: "postgres",
          supabasePublishableKey: "publishable-key",
          supabaseSecretKey: "service-role-secret",
          supabaseUrl: "https://project.supabase.co",
        },
        storage: {
          s3: {
            accessKeyId: "s3-access-key",
            secretAccessKey: "s3-secret-key",
          },
        },
      },
    };

    expect(baseBuddyConfigSchema.safeParse(legacySecretBearingConfig).success).toBe(false);
  });

  it("preserves changes from the app and CLI running in separate processes", async () => {
    await ensureBaseBuddyConfig({ now: fixedNow });
    const worker = join(originalCwd, "src/test/fixtures/config-write-worker.mjs");
    const loader = join(originalCwd, "node_modules/tsx/dist/loader.mjs");
    const run = promisify(execFile);
    await Promise.all(["app", "cli"].map((id) => run(process.execPath, ["--import", loader, worker, id], {
      cwd: tempDir,
      env: { ...process.env, BASEBUDDY_APP_STATE_BACKEND: "basebuddy-data", TSX_TSCONFIG_PATH: join(originalCwd, "tsconfig.json") },
      timeout: 12000,
    })));
    const config = await loadBaseBuddyConfig();
    expect(config.users.map((user) => user.id).sort()).toEqual(["app-0", "app-1", "app-2", "cli-0", "cli-1", "cli-2"]);
  });

  it("keeps redacted status output free of local password hashes", async () => {
    await ensureBaseBuddyConfig({
      now: fixedNow,
    });

    const config = await loadBaseBuddyConfig();
    const redacted = redactBaseBuddyConfig(config);
    const status = await getRedactedBaseBuddyConfigStatus();
    const serialized = JSON.stringify({ redacted, status });

    expect(serialized).not.toContain("owner-password-hash");
    expect(serialized).not.toContain("owner-password-salt");
    expect(status.config.exists).toBe(true);
    expect(status.config.valid).toBe(true);
  });
});
