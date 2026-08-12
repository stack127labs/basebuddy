# Configuration

By default, BaseBuddy app state lives in one BaseBuddy data config file:

```text
process.cwd()/basebuddy-data/basebuddy.config.json
```

Onboarding and CLI setup create and update this file. It stores install metadata, local users, sessions, projects, members, permissions, invitations, saved mappings, and sidebar settings.

Do not commit `basebuddy-data/`.

Audit events live beside it in:

```text
process.cwd()/basebuddy-data/basebuddy.audit.jsonl
```

Do not commit the audit log. It records sign-in, sign-out, and local user changes.

## App Data Storage

BaseBuddy supports three app data choices:

| Choice | Env | What happens |
| --- | --- | --- |
| `basebuddy-data` | Leave `BASEBUDDY_APP_STATE_BACKEND` blank, or set `basebuddy-data` | BaseBuddy writes `basebuddy-data/basebuddy.config.json` and `basebuddy-data/basebuddy.audit.jsonl`. This is the simplest single-server setup. |
| `supabase-same-project` | `BASEBUDDY_APP_STATE_BACKEND=supabase-same-project` | BaseBuddy stores app data in the same Postgres/Supabase project as your content, inside the BaseBuddy-owned `basebuddy` schema. |
| `supabase-split-project` | `BASEBUDDY_APP_STATE_BACKEND=supabase-split-project` and `BASEBUDDY_APP_STATE_DATABASE_URL=` | BaseBuddy stores app data in a separate Postgres/Supabase project, also inside the `basebuddy` schema. |

For the full comparison, read [App Data Storage Options](./app-data-storage-options.md).

The content database URL still stays in `BASEBUDDY_CONTENT_DATABASE_URL`. BaseBuddy does not store content database passwords, service keys, or storage keys in app data.

If the app-data database user can create schemas, run the CLI migration before creating the owner account:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If your host requires manual SQL, print the same SQL with:

```sh
pnpm basebuddy app-data:sql
```

The repository copy lives at [`docs/sql/basebuddy-app-state-postgres.sql`](./sql/basebuddy-app-state-postgres.sql). It creates only `basebuddy.app_state` and `basebuddy.audit_events`.

## Required Env

Credentials and signing secrets belong in `.env` or deployment environment variables:

```sh
BASEBUDDY_AUTH_SECRET=
BASEBUDDY_CONTENT_DATABASE_URL=
```

Optional app data env:

```sh
BASEBUDDY_APP_STATE_BACKEND=
BASEBUDDY_APP_STATE_DATABASE_URL=
```

For production, use a restricted database role in `BASEBUDDY_CONTENT_DATABASE_URL`. The setup checker flags broad role names such as `postgres` so you can replace them before editors start making routine changes. Start from [`docs/sql/restricted-content-role.sql`](./sql/restricted-content-role.sql).

Only needed if you want images or files in BaseBuddy:

```sh
# For Supabase media bucket storage.
BASEBUDDY_SUPABASE_URL=
BASEBUDDY_SUPABASE_PUBLISHABLE_KEY=
BASEBUDDY_SUPABASE_SECRET_KEY=

# For S3 bucket storage.
BASEBUDDY_S3_ACCESS_KEY_ID=
BASEBUDDY_S3_SECRET_ACCESS_KEY=
```

## Public Env

Optional public env values:

```sh
NEXT_PUBLIC_BASEBUDDY_APP_NAME=BaseBuddy
NEXT_PUBLIC_BASEBUDDY_DOCS_URL=https://basebuddy.version127.com/docs
NEXT_PUBLIC_BASEBUDDY_SUPPORT_URL=https://basebuddy.version127.com/support
NEXT_PUBLIC_SITE_INDEXABLE=false
```

## Content And Storage

The database URL and optional Supabase/S3 storage credentials are env values. They are install settings, not per-project rows or mapping rows.

BaseBuddy never changes the user content schema during normal setup.

BaseBuddy checks Postgres column update privileges when the workspace loads. If the configured database role can read a mapped field but cannot update its column, the field is shown as read-only and save falls back to a clear database permission error if the privilege changes later.
