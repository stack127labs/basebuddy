import { constants } from "node:fs";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import lockfile from "proper-lockfile";

import {
  BASEBUDDY_APP_STATE_BACKEND_ENV,
  BASEBUDDY_APP_STATE_DATABASE_URL_ENV,
} from "./app-state-backend";
import { getBaseBuddyPostgresSslConfig } from "./database-ssl";
import { getBaseBuddyConfigPath } from "./paths";
import {
  BASEBUDDY_CONTENT_DATABASE_URL_ENV,
  readBaseBuddyRuntimeEnv,
  redactDatabaseUrl,
} from "./env";
import { createPostgresBaseBuddyConfigStore, getPostgresBaseBuddyAppStateWriteAccess } from "./postgres-app-state-store";
import {
  baseBuddyConfigSchema,
  createDefaultBaseBuddyConfig,
  formatBaseBuddyConfigValidationError,
  redactBaseBuddyConfig,
  type BaseBuddyConfig,
  type CreateDefaultBaseBuddyConfigInput,
} from "./schema";

type BaseBuddyConfigStatus = {
  config: {
    error: string | null;
    exists: boolean;
    path: string;
    readable: boolean;
    valid: boolean;
    writable: boolean;
  };
  redactedConfig: BaseBuddyConfig | null;
};

let pendingConfigWrite: Promise<void> = Promise.resolve();
const postgresPoolsByDatabaseUrl = new Map<string, Pool>();

const createConfigReadError = (message: string, cause?: unknown) =>
  Object.assign(new Error(message), { cause });

const createInvalidConfigError = (error: unknown) => {
  if (error && typeof error === "object" && "issues" in error) {
    return createConfigReadError(
      `BaseBuddy config file is invalid: ${formatBaseBuddyConfigValidationError(
        error as Parameters<typeof formatBaseBuddyConfigValidationError>[0],
      )}`,
      error,
    );
  }

  return createConfigReadError("BaseBuddy config file is invalid.", error);
};

const parseBaseBuddyConfig = (rawConfig: string): BaseBuddyConfig => {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch (error) {
    throw createConfigReadError("Could not parse BaseBuddy config file.", error);
  }

  const result = baseBuddyConfigSchema.safeParse(parsedConfig);

  if (!result.success) {
    throw createInvalidConfigError(result.error);
  }

  return result.data;
};

const validateBaseBuddyConfig = (config: BaseBuddyConfig): BaseBuddyConfig => {
  const result = baseBuddyConfigSchema.safeParse(config);

  if (!result.success) {
    throw createInvalidConfigError(result.error);
  }

  return result.data;
};

const readBaseBuddyConfigFile = async (): Promise<string | null> => {
  try {
    return await readFile(getBaseBuddyConfigPath(), "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
};

export const getPostgresAppStateQueryClient = () => {
  const runtimeEnv = readBaseBuddyRuntimeEnv();
  const backend = runtimeEnv.appStateBackend;
  const databaseUrl = runtimeEnv.appStateDatabaseUrl;

  if (!databaseUrl) {
    const key =
      backend === "supabase-same-project"
        ? BASEBUDDY_CONTENT_DATABASE_URL_ENV
        : BASEBUDDY_APP_STATE_DATABASE_URL_ENV;

    throw new Error(`${key} is required when ${BASEBUDDY_APP_STATE_BACKEND_ENV} is ${backend}.`);
  }

  const existingPool = postgresPoolsByDatabaseUrl.get(databaseUrl);
  const pool = existingPool ?? new Pool({
    allowExitOnIdle: true,
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 1_000,
    max: 2,
    query_timeout: 5_000,
    ssl: getBaseBuddyPostgresSslConfig(databaseUrl),
    statement_timeout: 5_000,
  });

  if (!existingPool) {
    postgresPoolsByDatabaseUrl.set(databaseUrl, pool);
  }

  return pool;
};

const getPostgresAppStateConfigStore = () => {
  return createPostgresBaseBuddyConfigStore(getPostgresAppStateQueryClient());
};

export const loadOptionalBaseBuddyConfig = async (): Promise<BaseBuddyConfig | null> => {
  if (readBaseBuddyRuntimeEnv().appStateBackend !== "basebuddy-data") {
    return getPostgresAppStateConfigStore().loadOptional();
  }

  const rawConfig = await readBaseBuddyConfigFile();

  if (rawConfig === null) {
    return null;
  }

  return parseBaseBuddyConfig(rawConfig);
};

export const loadBaseBuddyConfig = async (): Promise<BaseBuddyConfig> => {
  const config = await loadOptionalBaseBuddyConfig();

  if (!config) {
    throw new Error("BaseBuddy config file does not exist.");
  }

  return config;
};

const writeValidatedBaseBuddyConfig = async (config: BaseBuddyConfig) => {
  const validatedConfig = validateBaseBuddyConfig(config);
  const configPath = getBaseBuddyConfigPath();
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  const serializedConfig = `${JSON.stringify(validatedConfig, null, 2)}\n`;

  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(tempPath, serializedConfig, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tempPath, configPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  return validatedConfig;
};

const withLocalConfigLock = async <T>(work: () => Promise<T>): Promise<T> => {
  const release = await lockfile.lock(getBaseBuddyConfigPath(), {
    realpath: false,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 40, minTimeout: 25, maxTimeout: 250, randomize: true },
  });
  try {
    return await work();
  } finally {
    await release();
  }
};

const writeLocalBaseBuddyConfig = async (
  updater: (config: BaseBuddyConfig) => BaseBuddyConfig | Promise<BaseBuddyConfig>,
): Promise<BaseBuddyConfig> => {
  const operation = pendingConfigWrite
    .catch(() => undefined)
    .then(() => withLocalConfigLock(async () => {
      const currentConfig = await loadBaseBuddyConfig();
      const nextConfig = await updater(currentConfig);
      return writeValidatedBaseBuddyConfig(nextConfig);
    }));

  pendingConfigWrite = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
};

export const writeBaseBuddyConfig = async (
  updater: (config: BaseBuddyConfig) => BaseBuddyConfig | Promise<BaseBuddyConfig>,
): Promise<BaseBuddyConfig> => {
  if (readBaseBuddyRuntimeEnv().appStateBackend !== "basebuddy-data") {
    return getPostgresAppStateConfigStore().write(updater);
  }

  return writeLocalBaseBuddyConfig(updater);
};

export const ensureBaseBuddyConfig = async (
  seed: CreateDefaultBaseBuddyConfigInput,
): Promise<BaseBuddyConfig> => {
  if (readBaseBuddyRuntimeEnv().appStateBackend !== "basebuddy-data") {
    return getPostgresAppStateConfigStore().ensure(seed);
  }

  const operation = pendingConfigWrite
    .catch(() => undefined)
    .then(() => withLocalConfigLock(async () => {
      const existingConfig = await loadOptionalBaseBuddyConfig();

      if (existingConfig) {
        return existingConfig;
      }

      return writeValidatedBaseBuddyConfig(createDefaultBaseBuddyConfig(seed));
    }));

  pendingConfigWrite = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
};

const canAccessConfig = async (mode: number) => {
  try {
    await access(getBaseBuddyConfigPath(), mode);
    return true;
  } catch {
    return false;
  }
};

export const getRedactedBaseBuddyConfigStatus =
  async (): Promise<BaseBuddyConfigStatus> => {
    const backend = readBaseBuddyRuntimeEnv().appStateBackend;

    if (backend !== "basebuddy-data") {
      const runtimeEnv = readBaseBuddyRuntimeEnv();
      const databaseUrl = runtimeEnv.appStateDatabaseUrl;
      const statusPath =
        backend === "supabase-same-project"
          ? "supabase same project: basebuddy.app_state"
          : "supabase separate project: basebuddy.app_state";

      if (!databaseUrl) {
        return {
          config: {
            error:
              backend === "supabase-same-project"
                ? `${BASEBUDDY_CONTENT_DATABASE_URL_ENV} is required for Supabase same-project app data.`
                : `${BASEBUDDY_APP_STATE_DATABASE_URL_ENV} is required for Supabase separate-project app data.`,
            exists: false,
            path: statusPath,
            readable: false,
            valid: false,
            writable: false,
          },
          redactedConfig: null,
        };
      }

      try {
        const config = await getPostgresAppStateConfigStore().loadOptional();
        const writable = await getPostgresBaseBuddyAppStateWriteAccess(getPostgresAppStateQueryClient());

        return {
          config: {
            error: null,
            exists: Boolean(config),
            path: `${statusPath} (${redactDatabaseUrl(databaseUrl)})`,
            readable: true,
            valid: Boolean(config),
            writable,
          },
          redactedConfig: config ? redactBaseBuddyConfig(config) : null,
        };
      } catch (error) {
        return {
          config: {
            error: error instanceof Error ? error.message : "BaseBuddy app data is invalid.",
            exists: true,
            path: `${statusPath} (${redactDatabaseUrl(databaseUrl)})`,
            readable: false,
            valid: false,
            writable: false,
          },
          redactedConfig: null,
        };
      }
    }

    const configPath = getBaseBuddyConfigPath();
    const readable = await canAccessConfig(constants.R_OK);
    const writable = await canAccessConfig(constants.W_OK);

    try {
      const config = await loadOptionalBaseBuddyConfig();

      return {
        config: {
          error: null,
          exists: Boolean(config),
          path: configPath,
          readable: Boolean(config) && readable,
          valid: Boolean(config),
          writable: Boolean(config) && writable,
        },
        redactedConfig: config ? redactBaseBuddyConfig(config) : null,
      };
    } catch (error) {
      return {
        config: {
          error: error instanceof Error ? error.message : "BaseBuddy config file is invalid.",
          exists: true,
          path: configPath,
          readable,
          valid: false,
          writable,
        },
        redactedConfig: null,
      };
    }
  };
