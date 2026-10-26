import {
  baseBuddyConfigSchema,
  createDefaultBaseBuddyConfig,
  formatBaseBuddyConfigValidationError,
  type BaseBuddyConfig,
  type CreateDefaultBaseBuddyConfigInput,
} from "./schema";

export const BASEBUDDY_APP_STATE_SCHEMA = "basebuddy";
export const BASEBUDDY_APP_STATE_CONFIG_ID = "default";

export type PostgresBaseBuddyConfigQueryClient = {
  query: <TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: TRow[] }>;
};

export type PostgresBaseBuddyConfigStore = {
  ensure: (seed: CreateDefaultBaseBuddyConfigInput) => Promise<BaseBuddyConfig>;
  load: () => Promise<BaseBuddyConfig>;
  loadOptional: () => Promise<BaseBuddyConfig | null>;
  write: (
    updater: (config: BaseBuddyConfig) => BaseBuddyConfig | Promise<BaseBuddyConfig>,
  ) => Promise<BaseBuddyConfig>;
};

export type PostgresBaseBuddyAuditEvent = {
  [key: string]: unknown;
  createdAt: string;
  id: string;
  type: string;
};

const APP_STATE_WRITE_ATTEMPTS = 8;

const explainAppStateError = (error: unknown): never => {
  if (error && typeof error === "object" && "code" in error && (error.code === "42P01" || error.code === "3F000")) {
    throw new Error("BaseBuddy app-data tables are missing. Run pnpm basebuddy app-data:migrate with a migration role, or apply pnpm basebuddy app-data:sql, then run app-data:check.", { cause: error });
  }
  throw error;
};

const createInvalidConfigError = (error: unknown) => {
  if (error && typeof error === "object" && "issues" in error) {
    return Object.assign(
      new Error(
        `BaseBuddy app-state config is invalid: ${formatBaseBuddyConfigValidationError(
          error as Parameters<typeof formatBaseBuddyConfigValidationError>[0],
        )}`,
      ),
      { cause: error },
    );
  }

  return Object.assign(new Error("BaseBuddy app-state config is invalid."), {
    cause: error,
  });
};

const validateBaseBuddyConfig = (config: unknown): BaseBuddyConfig => {
  const result = baseBuddyConfigSchema.safeParse(config);

  if (!result.success) {
    throw createInvalidConfigError(result.error);
  }

  return result.data;
};

export const BASEBUDDY_POSTGRES_APP_STATE_SETUP_SQL = `
create schema if not exists basebuddy;

create table if not exists basebuddy.app_state (
  id text primary key,
  config jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists basebuddy.audit_events (
  id text primary key,
  event jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);
`;

export const ensurePostgresBaseBuddyAppStateSchema = async (
  client: PostgresBaseBuddyConfigQueryClient,
) => {
  await client.query(BASEBUDDY_POSTGRES_APP_STATE_SETUP_SQL);
};

export const getPostgresBaseBuddyAppStateWriteAccess = async (
  client: PostgresBaseBuddyConfigQueryClient,
) => {
  const result = await client.query<{ writable: boolean }>(`
    select has_schema_privilege(current_user, 'basebuddy', 'USAGE')
      and has_table_privilege(current_user, 'basebuddy.app_state', 'SELECT')
      and has_table_privilege(current_user, 'basebuddy.app_state', 'INSERT')
      and has_table_privilege(current_user, 'basebuddy.app_state', 'UPDATE')
      and has_table_privilege(current_user, 'basebuddy.audit_events', 'INSERT') as writable
  `).catch(explainAppStateError);
  return result.rows[0]?.writable === true;
};

export const appendPostgresBaseBuddyAuditEvent = async <
  TEvent extends PostgresBaseBuddyAuditEvent,
>(
  client: PostgresBaseBuddyConfigQueryClient,
  event: TEvent,
) => {
  await client.query(
    `insert into basebuddy.audit_events (id, event)
     values ($1, $2)`,
    [event.id, event],
  ).catch(explainAppStateError);

  return event;
};

export const createPostgresBaseBuddyConfigStore = (
  client: PostgresBaseBuddyConfigQueryClient,
): PostgresBaseBuddyConfigStore => {
  const loadSnapshot = async () => {
    const result = await client.query<{ config: unknown }>(
      "select config from basebuddy.app_state where id = $1",
      [BASEBUDDY_APP_STATE_CONFIG_ID],
    ).catch(explainAppStateError);
    const row = result.rows[0];

    return row ? { config: validateBaseBuddyConfig(row.config), expectedConfig: JSON.stringify(row.config) } : null;
  };

  const loadOptional = async () => (await loadSnapshot())?.config ?? null;

  const load = async () => {
    const config = await loadOptional();

    if (!config) {
      throw new Error("BaseBuddy app-state config does not exist.");
    }

    return config;
  };

  const insert = async (config: BaseBuddyConfig) => {
    const validatedConfig = validateBaseBuddyConfig(config);
    const result = await client.query<{ config: unknown }>(
      `insert into basebuddy.app_state (id, config)
       values ($1, $2)
       on conflict (id) do nothing
       returning config`,
      [BASEBUDDY_APP_STATE_CONFIG_ID, validatedConfig],
    );

    return result.rows[0]?.config
      ? validateBaseBuddyConfig(result.rows[0].config)
      : await load();
  };

  const update = async (config: BaseBuddyConfig, expectedConfig: string) => {
    const validatedConfig = validateBaseBuddyConfig(config);
    const result = await client.query<{ config: unknown }>(
      `update basebuddy.app_state
       set config = $2, updated_at = timezone('utc', now())
       where id = $1 and config = $3::jsonb
       returning config`,
      [BASEBUDDY_APP_STATE_CONFIG_ID, validatedConfig, expectedConfig],
    ).catch(explainAppStateError);

    return result.rows[0] ? validateBaseBuddyConfig(result.rows[0].config) : null;
  };

  const ensure = async (seed: CreateDefaultBaseBuddyConfigInput) => {
    return (await loadOptional()) ?? insert(createDefaultBaseBuddyConfig(seed));
  };

  const write = async (
    updater: (config: BaseBuddyConfig) => BaseBuddyConfig | Promise<BaseBuddyConfig>,
  ) => {
    for (let attempt = 0; attempt < APP_STATE_WRITE_ATTEMPTS; attempt += 1) {
      const snapshot = await loadSnapshot();
      if (!snapshot) throw new Error("BaseBuddy app-state config does not exist.");
      // Retry the updater with fresh state when another process wins the write.
      const updated = await update(await updater(snapshot.config), snapshot.expectedConfig);
      if (updated) return updated;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
    throw new Error("BaseBuddy app data changed repeatedly while saving. Retry this action.");
  };

  return {
    ensure,
    load,
    loadOptional,
    write,
  };
};
