// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createDefaultBaseBuddyConfig } from "@/lib/basebuddy-config/schema";
import { appendPostgresBaseBuddyAuditEvent, createPostgresBaseBuddyConfigStore, ensurePostgresBaseBuddyAppStateSchema, getPostgresBaseBuddyAppStateWriteAccess } from "@/lib/basebuddy-config/postgres-app-state-store";
import { createDefaultContentMappingConfig, normalizeContentProjectMapping } from "@/lib/content-runtime/mapping";
import { getMappedContentPostById } from "@/lib/content-runtime/mapped-content-post-reads";
import { updateMappedContentPost } from "@/lib/content-runtime/mapped-content-post-writes";

const databaseUrl = process.env.BASEBUDDY_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("Postgres release regressions", () => {
  let pool: Pool;
  let restrictedPool: Pool;
  beforeAll(async () => {
    const target = new URL(databaseUrl);
    if (!target.pathname.startsWith("/basebuddy_test")) throw new Error("Integration tests require a dedicated basebuddy_test database.");
    pool = new Pool({ connectionString: databaseUrl, max: 4 });
    await ensurePostgresBaseBuddyAppStateSchema(pool);
    const store = createPostgresBaseBuddyConfigStore(pool);
    await store.ensure({});
    await store.write(() => createDefaultBaseBuddyConfig({}));
    await pool.query(`do $$ begin
      if not exists (select from pg_roles where rolname = 'basebuddy_release_runtime') then
        create role basebuddy_release_runtime login password 'basebuddy-local-runtime-test';
      end if;
    end $$;
    grant usage on schema basebuddy to basebuddy_release_runtime;
    grant select, insert, update on basebuddy.app_state to basebuddy_release_runtime;
    grant insert on basebuddy.audit_events to basebuddy_release_runtime;
    create schema if not exists basebuddy_release_test;
    create table if not exists basebuddy_release_test.posts (id text primary key, payload jsonb not null, updated_at timestamptz not null default now());`);
    target.username = "basebuddy_release_runtime";
    target.password = "basebuddy-local-runtime-test";
    restrictedPool = new Pool({ connectionString: target.toString(), max: 2 });
  });
  afterAll(async () => { await restrictedPool?.end(); await pool?.end(); });

  it("uses a runtime role without CREATE privileges for app-state reads and writes", async () => {
    const privileges = await restrictedPool.query("select has_database_privilege(current_user, current_database(), 'CREATE') as can_create");
    expect(privileges.rows[0].can_create).toBe(false);
    const store = createPostgresBaseBuddyConfigStore(restrictedPool);
    await expect(store.load()).resolves.toBeDefined();
    await expect(store.write((config) => config)).resolves.toBeDefined();
    await expect(appendPostgresBaseBuddyAuditEvent(restrictedPool, { id: `audit_${Date.now()}`, createdAt: new Date().toISOString(), type: "auth.logout" })).resolves.toBeDefined();
    await expect(getPostgresBaseBuddyAppStateWriteAccess(restrictedPool)).resolves.toBe(true);
    await pool.query("revoke update on basebuddy.app_state from basebuddy_release_runtime");
    try { await expect(getPostgresBaseBuddyAppStateWriteAccess(restrictedPool)).resolves.toBe(false); }
    finally { await pool.query("grant update on basebuddy.app_state to basebuddy_release_runtime"); }
  });

  it("preserves both concurrent app-state changes through database compare-and-swap", async () => {
    const first = createPostgresBaseBuddyConfigStore(pool);
    const second = createPostgresBaseBuddyConfigStore(restrictedPool);
    let arrived = 0;
    let release: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const once = () => {
      let initial = true;
      return async () => {
        if (!initial) return;
        initial = false;
        if (++arrived === 2) release();
        await barrier;
      };
    };
    const waitA = once(); const waitB = once();
    await Promise.all([
      first.write(async (config) => { await waitA(); return { ...config, install: { ...config.install, createdAt: "2026-01-01T00:00:00.000Z" } }; }),
      second.write(async (config) => { await waitB(); return { ...config, install: { ...config.install, updatedAt: "2026-02-01T00:00:00.000Z" } }; }),
    ]);
    expect((await first.load()).install).toMatchObject({ createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" });
  });

  const mapping = () => {
    const config = createDefaultContentMappingConfig();
    config.entities.posts.source = { kind: "table", schema: "basebuddy_release_test", table: "posts", primaryKey: "id" };
    config.entities.posts.status = "mapped";
    config.entities.posts.fields.id.column = "id";
    config.entities.posts.fields.title = { ...config.entities.posts.fields.title, column: "payload", path: "title" };
    config.entities.posts.fields.excerpt = { ...config.entities.posts.fields.excerpt, column: "payload", path: "excerpt" };
    config.entities.posts.fields.updatedAt.column = "updated_at";
    config.entities.posts.editorFields = [];
    return normalizeContentProjectMapping({ bindingId: "release-test", bindingMode: "mapped_content", bindingStatus: "ready", mappingConfig: config, revisionId: "release-1", revisionVersion: 1 });
  };

  it("rejects the second stale tab even when the editable timestamp did not change", async () => {
    await pool.query("insert into basebuddy_release_test.posts (id, payload) values ('stale', $1) on conflict (id) do update set payload = excluded.payload", [{ title: "Original", excerpt: "Keep" }]);
    const client = await pool.connect();
    try {
      const original = await getMappedContentPostById({ client, mapping: mapping(), postId: "stale" });
      expect(original.versionToken).toMatch(/^[a-f0-9]{64}$/);
      await updateMappedContentPost({ client, mapping: mapping(), postId: "stale", title: "First tab", expectedVersion: original.versionToken });
      await expect(updateMappedContentPost({ client, mapping: mapping(), postId: "stale", title: "Stale tab", expectedVersion: original.versionToken })).rejects.toMatchObject({ errors: [expect.objectContaining({ code: "stale_row_conflict" })] });
      const row = (await pool.query("select payload from basebuddy_release_test.posts where id = 'stale'")).rows[0];
      expect(row.payload).toEqual({ title: "First tab", excerpt: "Keep" });
    } finally { client.release(); }
  });

  it("preserves concurrent sibling JSON patches inside one transaction per save", async () => {
    await pool.query("insert into basebuddy_release_test.posts (id, payload) values ('siblings', $1) on conflict (id) do update set payload = excluded.payload", [{ title: "Original", excerpt: "Original", untouched: true }]);
    const a = await pool.connect(); const b = await pool.connect();
    try {
      await Promise.all([
        updateMappedContentPost({ client: a, mapping: mapping(), postId: "siblings", title: "New title" }),
        updateMappedContentPost({ client: b, mapping: mapping(), postId: "siblings", excerpt: "New excerpt" }),
      ]);
      expect((await pool.query("select payload from basebuddy_release_test.posts where id = 'siblings'")).rows[0].payload).toEqual({ title: "New title", excerpt: "New excerpt", untouched: true });
    } finally { a.release(); b.release(); }
  });
});
