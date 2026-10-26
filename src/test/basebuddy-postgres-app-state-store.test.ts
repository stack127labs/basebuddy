import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDefaultBaseBuddyConfig } from "@/lib/basebuddy-config/schema";
import {
  BASEBUDDY_APP_STATE_CONFIG_ID,
  appendPostgresBaseBuddyAuditEvent,
  createPostgresBaseBuddyConfigStore,
  getPostgresBaseBuddyAppStateWriteAccess,
  type PostgresBaseBuddyConfigQueryClient,
} from "@/lib/basebuddy-config/postgres-app-state-store";

const fixedNow = "2026-05-27T00:00:00.000Z";

const createMemoryQuery = () => {
  let config: unknown = null;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/select config/i.test(sql)) {
      return {
        rows: config
          ? [
              {
                config,
              },
            ]
          : [],
      };
    }

    if (/insert into basebuddy.app_state/i.test(sql)) {
      config = values[1];
      return {
        rows: [
          {
            config,
          },
        ],
      };
    }

    if (/update basebuddy.app_state/i.test(sql)) {
      config = values[1];
      return {
        rows: [
          {
            config,
          },
        ],
      };
    }

    if (/insert into basebuddy.audit_events/i.test(sql)) {
      return {
        rows: [
          {
            event: values[1],
          },
        ],
      };
    }

    return { rows: [] };
  });

  return { query: query as unknown as PostgresBaseBuddyConfigQueryClient["query"] };
};

describe("Postgres BaseBuddy app-state store", () => {
  it("stores the existing validated BaseBuddy config shape in one BaseBuddy-owned row", async () => {
    const client = createMemoryQuery();
    const store = createPostgresBaseBuddyConfigStore(client);

    const ensured = await store.ensure({
      now: fixedNow,
    });
    const loaded = await store.loadOptional();

    expect(loaded).toEqual(ensured);
    expect(ensured).toEqual(createDefaultBaseBuddyConfig({ now: fixedNow }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/insert into basebuddy\.app_state/i),
      [BASEBUDDY_APP_STATE_CONFIG_ID, ensured],
    );
  });

  it("serializes updates and validates before writing", async () => {
    const client = createMemoryQuery();
    const store = createPostgresBaseBuddyConfigStore(client);

    await store.ensure({
      now: fixedNow,
    });
    const updated = await store.write((config) => ({
      ...config,
      users: [
        {
          avatarUrl: null,
          createdAt: fixedNow,
          email: "owner@example.com",
          id: "user_owner",
          name: "Owner",
          passwordHash: "password-hash",
          passwordHashParams: {
            keyLength: 64,
            name: "scrypt",
          },
          passwordSalt: "password-salt",
          updatedAt: fixedNow,
        },
      ],
    }));

    expect(updated.users).toHaveLength(1);
    await expect(store.load()).resolves.toEqual(updated);
  });

  it("stores audit events in a separate BaseBuddy-owned table", async () => {
    const client = createMemoryQuery();
    const event = await appendPostgresBaseBuddyAuditEvent(client, {
      actorEmail: "owner@example.com",
      createdAt: fixedNow,
      id: "audit_1",
      type: "auth.login.success",
    });

    expect(event).toMatchObject({
      actorEmail: "owner@example.com",
      type: "auth.login.success",
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/insert into basebuddy\.audit_events/i),
      [
        "audit_1",
        expect.objectContaining({
          type: "auth.login.success",
        }),
      ],
    );
  });

  it("reads existing app data without requiring schema creation privileges", async () => {
    const client = createMemoryQuery();
    const store = createPostgresBaseBuddyConfigStore(client);
    await store.ensure({ now: fixedNow });
    vi.mocked(client.query).mockClear();

    await store.load();
    await appendPostgresBaseBuddyAuditEvent(client, {
      createdAt: fixedNow,
      id: "audit_runtime",
      type: "auth.logout",
    });

    expect(vi.mocked(client.query).mock.calls.every(([sql]) => !/create\s+(schema|table)/i.test(sql))).toBe(true);
  });

  it("retries a conflicting write against the latest app data", async () => {
    let config = createDefaultBaseBuddyConfig({ now: fixedNow });
    let updates = 0;
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (/select config/i.test(sql)) return { rows: [{ config: structuredClone(config) }] };
      if (/update basebuddy.app_state/i.test(sql)) {
        updates += 1;
        if (updates === 1) {
          config.install.updatedAt = "2026-05-28T00:00:00.000Z";
          return { rows: [] };
        }
        config = values[1] as typeof config;
        return { rows: [{ config }] };
      }
      return { rows: [] };
    });
    const store = createPostgresBaseBuddyConfigStore({ query } as unknown as PostgresBaseBuddyConfigQueryClient);

    const saved = await store.write((current) => ({ ...current, install: { ...current.install, createdAt: "2026-05-26T00:00:00.000Z" } }));

    expect(updates).toBe(2);
    expect(saved.install.updatedAt).toBe("2026-05-28T00:00:00.000Z");
    expect(saved.install.createdAt).toBe("2026-05-26T00:00:00.000Z");
    expect(query.mock.calls.filter(([sql]) => /update basebuddy.app_state/i.test(sql)).every(([sql, values]) => /config\s*=\s*\$3/i.test(sql) && values.length === 3)).toBe(true);
  });

  it("explains how to prepare missing app-data tables", async () => {
    const query = vi.fn().mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    const store = createPostgresBaseBuddyConfigStore({ query });
    await expect(store.loadOptional()).rejects.toThrow(/app-data:migrate/);
  });

  it("does not report read-only database app data as writable", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ writable: false }] }) };
    await expect(getPostgresBaseBuddyAppStateWriteAccess(client)).resolves.toBe(false);
  });
});
