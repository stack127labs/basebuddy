# App Data Storage Options

BaseBuddy app data is the setup state for BaseBuddy itself. It is separate from your content database tables.

App data includes:

- local BaseBuddy users and password hashes;
- session token hashes;
- projects;
- project members, roles, permissions, and author scopes;
- invitations;
- saved mappings and mapping revisions;
- sidebar layout;
- audit events.

App data does not include database URLs, auth signing secrets, Supabase keys, S3 keys, or content rows. Those stay in environment variables or in your existing content database.

BaseBuddy supports three app-data choices.

## Quick Choice

| Choice | Best for | Extra setup | Main tradeoff |
| --- | --- | --- | --- |
| `basebuddy-data/` folder on same server | One server, simple self-hosting, easiest local setup | None | The server must keep `basebuddy-data/` on persistent writable storage |
| A new Supabase/Postgres database | Production installs, restarts, multiple app instances, cleaner separation | Run BaseBuddy app-data table setup | One more database URL to manage |
| Same database as your content | One database to manage, simple Supabase projects, smaller deployments | Run BaseBuddy app-data table setup | The content database role must also read/write BaseBuddy app-data tables |

If you are unsure and running one VPS or one Docker container with a volume, choose `basebuddy-data/`.

If your host replaces local files on deploy, restarts often, or may run more than one BaseBuddy server, choose a Supabase/Postgres app-data backend.

For production with the cleanest separation, choose a new Supabase/Postgres database.

## Option 1: `basebuddy-data/` Folder On Same Server

This is the default. Leave `BASEBUDDY_APP_STATE_BACKEND` blank, or set:

```sh
BASEBUDDY_APP_STATE_BACKEND=basebuddy-data
```

BaseBuddy creates:

```text
process.cwd()/basebuddy-data/basebuddy.config.json
process.cwd()/basebuddy-data/basebuddy.audit.jsonl
```

The app and CLI create this folder automatically. Users do not need to create it by hand.

### What it stores

`basebuddy.config.json` stores users, sessions, projects, members, permissions, invitations, mappings, and sidebar layout.

`basebuddy.audit.jsonl` stores login, logout, and local user change events.

### What it needs

The running app needs read/write access to `basebuddy-data/`.

In production, the folder must survive deploys, restarts, and container replacement. Use a persistent volume or host-level persistent storage.

### Good fit

Use this when:

- BaseBuddy runs on one server;
- you control the filesystem;
- you can mount or preserve `basebuddy-data/`;
- you want the shortest setup.

### Avoid it when

Avoid this option when:

- the host is immutable or serverless;
- deploys replace the app filesystem;
- you run multiple BaseBuddy instances at the same time;
- you cannot back up the folder reliably.

### Setup commands

No table setup is needed.

```sh
pnpm basebuddy setup \
  --owner-email owner@example.com \
  --owner-name "Owner" \
  --owner-password "replace-with-a-strong-password"

pnpm basebuddy doctor
```

## Option 2: A New Supabase/Postgres Database

Use:

```sh
BASEBUDDY_APP_STATE_BACKEND=supabase-split-project
BASEBUDDY_APP_STATE_DATABASE_URL=postgresql://...
```

The content database still comes from:

```sh
BASEBUDDY_CONTENT_DATABASE_URL=postgresql://...
```

BaseBuddy stores app data in the separate database, inside:

```text
basebuddy.app_state
basebuddy.audit_events
```

### What it stores

The same app data as the default folder backend: users, session hashes, projects, members, permissions, invitations, mappings, sidebar layout, and audit events.

### What it needs

The app-data database role must be able to read and write the BaseBuddy-owned `basebuddy` schema.

To prepare the tables:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If the runtime role cannot create schemas or tables, print SQL and run it with an admin role:

```sh
pnpm basebuddy app-data:sql
```

Then run:

```sh
pnpm basebuddy app-data:check
```

### Good fit

Use this when:

- BaseBuddy runs in production;
- deploys may replace local files;
- the app may restart often;
- you may run more than one BaseBuddy instance;
- you want BaseBuddy app data separate from content data;
- you want database backups instead of filesystem backups.

### Tradeoffs

You manage one more database URL. Keep `BASEBUDDY_APP_STATE_DATABASE_URL` in env, never in docs, screenshots, mapping JSON, or app data.

## Option 3: Same Database As Your Content

Use:

```sh
BASEBUDDY_APP_STATE_BACKEND=supabase-same-project
BASEBUDDY_CONTENT_DATABASE_URL=postgresql://...
```

There is no separate `BASEBUDDY_APP_STATE_DATABASE_URL` for this mode. BaseBuddy uses the content database connection for both content access and app-data access.

BaseBuddy app data lives in:

```text
basebuddy.app_state
basebuddy.audit_events
```

Your content tables remain in their existing schemas. BaseBuddy does not rename, reshape, or migrate those tables during setup.

### What it stores

The same BaseBuddy app data as the other options: users, session hashes, projects, members, permissions, invitations, mappings, sidebar layout, and audit events.

### What it needs

The database role in `BASEBUDDY_CONTENT_DATABASE_URL` needs both:

- the content-table permissions editors need;
- read/write access to `basebuddy.app_state` and `basebuddy.audit_events`.

Prepare the app-data tables with:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If the role cannot create tables:

```sh
pnpm basebuddy app-data:sql
```

Run the SQL in your database SQL editor, then run `app-data:check`.

### Good fit

Use this when:

- you want one database to manage;
- the content database is already durable and backed up;
- your deployment host cannot keep `basebuddy-data/`;
- you are comfortable storing BaseBuddy app data beside your content database.

### Tradeoffs

This is simpler than a separate database, but it mixes BaseBuddy app data with your content database. Keep permissions tight: the role should have only the content table access editors need, plus the BaseBuddy-owned `basebuddy` schema access.

## Auth Behavior In All Three Options

BaseBuddy does not use Supabase Auth for editor login.

In every app-data option:

- users are local BaseBuddy users;
- passwords are hashed before storage;
- sessions are signed with `BASEBUDDY_AUTH_SECRET`;
- session records live in the selected app-data backend;
- invites and member roles live in the selected app-data backend.

Changing app-data storage changes where these BaseBuddy records live. It does not change the login model.

## Backup Differences

| Choice | Back up this | Do not commit |
| --- | --- | --- |
| `basebuddy-data/` | `basebuddy-data/basebuddy.config.json` and `basebuddy-data/basebuddy.audit.jsonl` | `basebuddy-data/` |
| New Supabase/Postgres database | `basebuddy` schema tables in the app-data database | database URLs and dumps with secrets |
| Same database as content | `basebuddy` schema tables plus normal content DB backups | database URLs and dumps with secrets |

Keep backups private. App data contains local user records, password hashes, session hashes, mappings, permissions, invitations, and project setup.

## Hosting Differences

| Host shape | Recommended choice |
| --- | --- |
| Single VPS with persistent disk | `basebuddy-data/` |
| Docker on one server with a mounted volume | `basebuddy-data/` |
| Dokploy with persistent volume | `basebuddy-data/` or split database |
| Multiple app instances | New Supabase/Postgres database |
| Immutable/serverless host without durable writable storage | New Supabase/Postgres database |
| Small Supabase-first setup that wants one database | Same database as content |

The default `basebuddy-data/` backend is not a good fit for Vercel, Netlify, or similar immutable deploys unless you provide durable writable storage.

## CLI Flow By Option

### `basebuddy-data/`

```sh
pnpm basebuddy setup \
  --owner-email owner@example.com \
  --owner-name "Owner" \
  --owner-password "replace-with-a-strong-password"

pnpm basebuddy doctor
```

### New Supabase/Postgres Database

```sh
BASEBUDDY_APP_STATE_BACKEND=supabase-split-project
BASEBUDDY_APP_STATE_DATABASE_URL=postgresql://...

pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check

pnpm basebuddy setup \
  --owner-email owner@example.com \
  --owner-name "Owner" \
  --owner-password "replace-with-a-strong-password"

pnpm basebuddy doctor
```

### Same Database As Content

```sh
BASEBUDDY_APP_STATE_BACKEND=supabase-same-project
BASEBUDDY_CONTENT_DATABASE_URL=postgresql://...

pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check

pnpm basebuddy setup \
  --owner-email owner@example.com \
  --owner-name "Owner" \
  --owner-password "replace-with-a-strong-password"

pnpm basebuddy doctor
```

## How To Decide

Choose `basebuddy-data/` if you want the simplest setup and can keep one private folder persistent.

Choose a new Supabase/Postgres database if you want the cleanest production setup, app restarts without filesystem concerns, and app data separated from content.

Choose the same database as content if you want one database to manage and can grant the same connection role both BaseBuddy app-data access and restricted content-table access.

## Related Pages

- [Configuration](./configuration.md)
- [First-run setup](./onboarding.md)
- [CLI](./cli.md)
- [Deployment](./deployment.md)
- [Operations](./operations.md)
- [Security](../SECURITY.md)
- [Troubleshooting](./troubleshooting.md)

## Current deployment limit

Run one BaseBuddy app instance. Database-backed app data survives restarts and coordinates concurrent configuration writes, but editor presence, caches, and request limits remain local to each process. Shared app data alone does not make a multi-instance deployment supported.
