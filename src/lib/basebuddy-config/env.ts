import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASEBUDDY_APP_STATE_BACKEND_ENV,
  BASEBUDDY_APP_STATE_DATABASE_URL_ENV,
  getBaseBuddyAppStateBackend,
  getBaseBuddyAppStateDatabaseUrl,
  type BaseBuddyAppStateBackend,
} from "./app-state-backend";

export const BASEBUDDY_AUTH_SECRET_ENV = "BASEBUDDY_AUTH_SECRET";
export const BASEBUDDY_SETUP_TOKEN_ENV = "BASEBUDDY_SETUP_TOKEN";
export const BASEBUDDY_CONTENT_DATABASE_URL_ENV = "BASEBUDDY_CONTENT_DATABASE_URL";
export const BASEBUDDY_SUPABASE_URL_ENV = "BASEBUDDY_SUPABASE_URL";
export const BASEBUDDY_SUPABASE_PUBLISHABLE_KEY_ENV =
  "BASEBUDDY_SUPABASE_PUBLISHABLE_KEY";
export const BASEBUDDY_SUPABASE_SECRET_KEY_ENV = "BASEBUDDY_SUPABASE_SECRET_KEY";
export const BASEBUDDY_S3_ACCESS_KEY_ID_ENV = "BASEBUDDY_S3_ACCESS_KEY_ID";
export const BASEBUDDY_S3_SECRET_ACCESS_KEY_ENV = "BASEBUDDY_S3_SECRET_ACCESS_KEY";

const BASEBUDDY_RUNTIME_ENV_KEYS = [
  BASEBUDDY_APP_STATE_BACKEND_ENV,
  BASEBUDDY_APP_STATE_DATABASE_URL_ENV,
  BASEBUDDY_AUTH_SECRET_ENV,
  BASEBUDDY_SETUP_TOKEN_ENV,
  BASEBUDDY_CONTENT_DATABASE_URL_ENV,
  BASEBUDDY_SUPABASE_URL_ENV,
  BASEBUDDY_SUPABASE_PUBLISHABLE_KEY_ENV,
  BASEBUDDY_SUPABASE_SECRET_KEY_ENV,
  BASEBUDDY_S3_ACCESS_KEY_ID_ENV,
  BASEBUDDY_S3_SECRET_ACCESS_KEY_ENV,
] as const;
const BASEBUDDY_RUNTIME_ENV_KEY_SET = new Set<string>(BASEBUDDY_RUNTIME_ENV_KEYS);
const BASEBUDDY_ENV_FILE_NAMES = [".env", ".env.local"] as const;
type BaseBuddyEnvValues = Record<string, string | undefined>;

export type BaseBuddyRuntimeEnv = {
  appStateBackend: BaseBuddyAppStateBackend;
  appStateDatabaseUrl: string | null;
  authSecret: string | null;
  contentDatabaseUrl: string | null;
  contentSupabasePublishableKey: string | null;
  contentSupabaseSecretKey: string | null;
  contentSupabaseUrl: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
};

const normalizeEnvValue = (value: string | null | undefined) => {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue || null;
};

const normalizeEnvFileValue = (rawValue: string) => {
  const trimmedValue = rawValue.trim();
  const quote = trimmedValue[0];

  if (
    (quote === "\"" || quote === "'") &&
    trimmedValue.length >= 2 &&
    trimmedValue[trimmedValue.length - 1] === quote
  ) {
    const unquotedValue = trimmedValue.slice(1, -1);

    if (quote === "\"") {
      return unquotedValue
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
    }

    return unquotedValue;
  }

  return trimmedValue.replace(/\s+#.*$/, "").trim();
};

const parseBaseBuddyEnvFile = (contents: string): BaseBuddyEnvValues => {
  const values: BaseBuddyEnvValues = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const normalizedLine = trimmedLine.startsWith("export ")
      ? trimmedLine.slice("export ".length).trim()
      : trimmedLine;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(normalizedLine);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (!BASEBUDDY_RUNTIME_ENV_KEY_SET.has(key)) {
      continue;
    }

    values[key] = normalizeEnvFileValue(rawValue);
  }

  return values;
};

const readBaseBuddyEnvFileValues = (cwd = process.cwd()): BaseBuddyEnvValues => {
  const values: BaseBuddyEnvValues = {};

  for (const fileName of BASEBUDDY_ENV_FILE_NAMES) {
    try {
      Object.assign(values, parseBaseBuddyEnvFile(readFileSync(join(cwd, fileName), "utf8")));
    } catch {
      // Missing or unreadable env files should surface as missing setup checks, not crash setup.
    }
  }

  return values;
};

const resolveBaseBuddyRuntimeEnv = (env: NodeJS.ProcessEnv) =>
  env === process.env
    ? {
        ...readBaseBuddyEnvFileValues(),
        ...env,
      }
    : env;

export const readBaseBuddySetupToken = () =>
  normalizeEnvValue(resolveBaseBuddyRuntimeEnv(process.env)[BASEBUDDY_SETUP_TOKEN_ENV]);

export const readBaseBuddyRuntimeEnv = (
  env: NodeJS.ProcessEnv = process.env,
): BaseBuddyRuntimeEnv => {
  const runtimeEnv = resolveBaseBuddyRuntimeEnv(env);

  return {
    appStateBackend: getBaseBuddyAppStateBackend(runtimeEnv),
    appStateDatabaseUrl: getBaseBuddyAppStateDatabaseUrl(runtimeEnv),
    authSecret: normalizeEnvValue(runtimeEnv[BASEBUDDY_AUTH_SECRET_ENV]),
    contentDatabaseUrl: normalizeEnvValue(runtimeEnv[BASEBUDDY_CONTENT_DATABASE_URL_ENV]),
    contentSupabasePublishableKey: normalizeEnvValue(
      runtimeEnv[BASEBUDDY_SUPABASE_PUBLISHABLE_KEY_ENV],
    ),
    contentSupabaseSecretKey: normalizeEnvValue(
      runtimeEnv[BASEBUDDY_SUPABASE_SECRET_KEY_ENV],
    ),
    contentSupabaseUrl: normalizeEnvValue(runtimeEnv[BASEBUDDY_SUPABASE_URL_ENV]),
    s3AccessKeyId: normalizeEnvValue(runtimeEnv[BASEBUDDY_S3_ACCESS_KEY_ID_ENV]),
    s3SecretAccessKey: normalizeEnvValue(runtimeEnv[BASEBUDDY_S3_SECRET_ACCESS_KEY_ENV]),
  };
};

export const fingerprintSecret = (value: string) =>
  `set:${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;

export const redactDatabaseUrl = (value: string) => fingerprintSecret(value);

export const redactEnvCredentialValue = ({
  key,
  value,
}: {
  key: string;
  value: string | null;
}) => {
  if (!value) {
    return null;
  }

  if (key === BASEBUDDY_CONTENT_DATABASE_URL_ENV) {
    return redactDatabaseUrl(value);
  }

  if (key.endsWith("_URL")) {
    return value;
  }

  return fingerprintSecret(value);
};

export const requireBaseBuddyAuthSecret = () => {
  const authSecret = readBaseBuddyRuntimeEnv().authSecret;

  if (!authSecret || authSecret.length < 32) {
    throw new Error(`${BASEBUDDY_AUTH_SECRET_ENV} must be set to at least 32 characters.`);
  }

  return authSecret;
};

export const getBaseBuddyContentRuntimeEnv = () => {
  const runtimeEnv = readBaseBuddyRuntimeEnv();

  return {
    apiUrl: runtimeEnv.contentSupabaseUrl,
    databaseUrl: runtimeEnv.contentDatabaseUrl,
    publishableKey: runtimeEnv.contentSupabasePublishableKey,
  };
};

export const getBaseBuddyContentStorageServiceKey = () =>
  readBaseBuddyRuntimeEnv().contentSupabaseSecretKey;

export const getBaseBuddyS3CompatibleStorageCredentials = () => {
  const runtimeEnv = readBaseBuddyRuntimeEnv();

  if (!runtimeEnv.s3AccessKeyId || !runtimeEnv.s3SecretAccessKey) {
    return null;
  }

  return {
    accessKeyId: runtimeEnv.s3AccessKeyId,
    secretAccessKey: runtimeEnv.s3SecretAccessKey,
  };
};

export const getBaseBuddyS3CompatibleStorageCredentialStatus = () => {
  const credentials = getBaseBuddyS3CompatibleStorageCredentials();

  return {
    hasS3AccessKeyId: Boolean(credentials?.accessKeyId),
    hasS3SecretAccessKey: Boolean(credentials?.secretAccessKey),
  };
};
