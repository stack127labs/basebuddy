# BaseBuddy Install Guide

BaseBuddy is a self-hosted editor for existing Postgres/Supabase schemas. Fresh installs store BaseBuddy app state in one local data folder by default:

```text
process.cwd()/basebuddy-data/basebuddy.config.json
```

The setup UI and CLI create that folder and file for you. Do not commit `basebuddy-data/`.

You can also store BaseBuddy app data in Supabase/Postgres:

- `BASEBUDDY_APP_STATE_BACKEND=supabase-same-project` stores app data in the same database as your content, inside the BaseBuddy-owned `basebuddy` schema.
- `BASEBUDDY_APP_STATE_BACKEND=supabase-split-project` plus `BASEBUDDY_APP_STATE_DATABASE_URL` stores app data in a separate database.

## Prerequisites

- Node.js 22 recommended.
- `pnpm@10.32.1`.
- A Postgres/Supabase database that already contains the content tables you want to edit.
- Optional Supabase Storage or S3-compatible credentials when mapped media or files need private object storage.

## 1. Clone And Install

```sh
git clone git@github.com:version127/basebuddy.git
cd basebuddy
pnpm install
```

Start the app:

```sh
pnpm dev
```

The dev server runs on port `8080`.

Open setup:

```text
http://localhost:8080/onboarding
```

## 2. Connect To Your Database

Create `.env` for local testing, or set the same values in production:

```sh
BASEBUDDY_AUTH_SECRET=
BASEBUDDY_CONTENT_DATABASE_URL=
```

Optional app-data backend:

```sh
BASEBUDDY_APP_STATE_BACKEND=
BASEBUDDY_APP_STATE_DATABASE_URL=
```

Only needed if you want images or files in BaseBuddy:

```sh
# For Supabase media bucket storage.
BASEBUDDY_SUPABASE_URL=https://your-project-ref.supabase.co
BASEBUDDY_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
BASEBUDDY_SUPABASE_SECRET_KEY=your-server-key

# For S3 bucket storage.
BASEBUDDY_S3_ACCESS_KEY_ID=your-s3-access-key
BASEBUDDY_S3_SECRET_ACCESS_KEY=your-s3-secret-key
```

For local Supabase content databases, add `?sslmode=disable` to the database URL. For hosted Supabase, use TLS verification. Do not use `sslmode=no-verify`; if your environment needs a custom CA, add `sslmode=verify-full&sslrootcert=/absolute/path/to/root.crt`.

For production, use a restricted database role instead of the broad `postgres` owner. Start from [`docs/sql/restricted-content-role.sql`](./docs/sql/restricted-content-role.sql), then grant only the tables and columns editors should use.

## 3. Prepare App-Data Tables

Skip this section when you use the default `basebuddy-data/` folder.

For Supabase/Postgres app data, run:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If your app-data database role cannot create schemas or tables, print the SQL and run it in your database SQL editor:

```sh
pnpm basebuddy app-data:sql
```

This creates only `basebuddy.app_state` and `basebuddy.audit_events`.

## 4. Create The Owner Account

On `/onboarding`, complete **Connect to your database**, prepare app-data tables when that page appears, then enter:

- owner name
- owner email
- owner password

Continue through setup. BaseBuddy writes the selected app-data backend and hashes the owner password. It does not write database URLs or service keys into app data.

The next screen runs setup checks automatically. It verifies the env values, owner account, app-data state, database role, and database connection before showing **Open BaseBuddy**.

BaseBuddy also writes sign-in and local user audit events to `basebuddy-data/basebuddy.audit.jsonl`. Do not commit `basebuddy-data/`.

## 5. Sign In

After setup is created:

1. Open `/login`.
2. Sign in with the owner email and password.
3. Open `/projects`.

## CLI Setup

Agents or operators can create the same BaseBuddy data config from the CLI:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

Skip those two commands when you use the default `basebuddy-data/` folder.

```sh
pnpm basebuddy setup \
  --owner-email "owner@example.com" \
  --owner-name "Owner User" \
  --owner-password "replace-with-a-strong-password"
```

Check setup:

```sh
pnpm basebuddy doctor
pnpm setup:check
```

All CLI diagnostics redact secrets.

The CLI can also create projects, add members, create invites, adjust permission overrides, save mapping/sidebar JSON, and update non-secret storage mapping metadata. See [CLI](./docs/cli.md).

## 5. Create The First Project

1. Open `/projects`.
2. Create a project with a name and slug.
3. Open the project editor.
4. Use auto-detection if it helps, or choose manual mapping.
5. Map posts, authors, categories, tags, workflow fields, media, and files as needed.
6. Save the mapping.

The saved mapping is the runtime source of truth.

## 6. Edit Content

After mapping:

1. Open the mapped Posts collection.
2. Select or create a post.
3. Edit mapped fields.
4. Use `Save` for dirty-field writes.
5. Use `Publish`, `Unpublish`, or `Archive` only when you intend a workflow action.

BaseBuddy does not rename, reshape, or migrate your content tables during normal setup or editing.

## Production

Build and start:

```sh
pnpm build
pnpm start
```

`pnpm start` serves the app on port `8080`.

Before exposing BaseBuddy publicly:

- run `pnpm basebuddy doctor`;
- confirm required secrets are set in env, not in the repo;
- confirm your chosen app-data backend is ready;
- if you use `basebuddy-data`, confirm `basebuddy-data/basebuddy.config.json` is present on the server and `basebuddy-data/` is ignored by git;
- if you use `basebuddy-data`, confirm the server has persistent writable storage for it;
- place the app behind HTTPS;
- set request body limits that match your upload policy;
- use a shared upstream rate limiter if you run multiple app instances.

Production responses include HSTS. Confirm HTTPS is working for the final domain before exposing the app to real users.

BaseBuddy is not currently designed for editable Vercel/Netlify-style serverless deploys with the default `basebuddy-data` backend unless you provide durable writable storage. Use the Supabase/Postgres app-data backend when the app may restart or scale across instances.

## Next Steps

- [Configuration](./docs/configuration.md)
- [Onboarding](./docs/onboarding.md)
- [Deployment](./docs/deployment.md)
- [Troubleshooting](./docs/troubleshooting.md)
