# AGENTS.md

BaseBuddy is a self-hosted editor for existing Postgres and Supabase schemas.
Use this file as the starting point when an AI agent is asked to install, configure,
operate, or modify this repo.

## What BaseBuddy Does

- Runs one BaseBuddy install with many projects.
- Lets each project map an existing content schema into an editor.
- Uses the saved mapping as the runtime source of truth.
- Reads and writes user content through mapped storage targets.
- Keeps setup state in one selected app-data backend: `basebuddy-data/` by default, or optional Supabase/Postgres app data.

BaseBuddy is storage-first, not CMS-first. The database shape belongs to the user.

## Hard Rules

- Do not rename, reshape, or migrate user content tables unless the user explicitly asks for database schema work.
- Do not mutate user content schemas during setup.
- Do not store secrets in BaseBuddy app data.
- Do not commit `.env`, `.env.local`, `basebuddy-data/`, or audit logs.
- Do not invent custom config paths. The default local path is `process.cwd()/basebuddy-data/basebuddy.config.json`.
- Normal save must write dirty mapped fields only.
- Publish, unpublish, and archive must remain explicit actions.
- Unsupported or unsafe mappings should become read-only or unsupported instead of being coerced.
- Manual mapping fallback is better than blocking setup.

## Setup Model

BaseBuddy app state lives here by default:

```text
process.cwd()/basebuddy-data/basebuddy.config.json
```

The app and CLI create `basebuddy-data/` automatically. Users should not commit it.

Optional app-data backends:

```sh
# Same Supabase/Postgres project as content.
BASEBUDDY_APP_STATE_BACKEND=supabase-same-project

# Separate Supabase/Postgres project.
BASEBUDDY_APP_STATE_BACKEND=supabase-split-project
BASEBUDDY_APP_STATE_DATABASE_URL=
```

Those DB-backed options use the BaseBuddy-owned `basebuddy.app_state` and `basebuddy.audit_events` tables. Use CLI/UI commands instead of editing rows directly.

Prepare DB-backed app data with:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If the app-data role cannot create schemas or tables, print SQL with:

```sh
pnpm basebuddy app-data:sql
```

Audit events live here:

```text
process.cwd()/basebuddy-data/basebuddy.audit.jsonl
```

Secrets and deployment credentials belong in env:

```sh
BASEBUDDY_AUTH_SECRET=
BASEBUDDY_CONTENT_DATABASE_URL=
```

Use a restricted database role for `BASEBUDDY_CONTENT_DATABASE_URL` in production. BaseBuddy marks mapped fields read-only when Postgres says that role cannot update their columns.

Optional media/file storage env values:

```sh
# For Supabase media bucket storage.
BASEBUDDY_SUPABASE_URL=
BASEBUDDY_SUPABASE_PUBLISHABLE_KEY=
BASEBUDDY_SUPABASE_SECRET_KEY=

# For S3 bucket storage.
BASEBUDDY_S3_ACCESS_KEY_ID=
BASEBUDDY_S3_SECRET_ACCESS_KEY=
```

## Agent Setup Flow

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` or set equivalent production env values.
3. Set `BASEBUDDY_AUTH_SECRET` and `BASEBUDDY_CONTENT_DATABASE_URL`.
4. Run `pnpm basebuddy doctor`.
5. If Supabase/Postgres app data is selected, run `pnpm basebuddy app-data:migrate` and `pnpm basebuddy app-data:check`.
6. Create setup with onboarding UI or `pnpm basebuddy setup`.
7. Start the app with `pnpm start` after build, or the repo's documented development command while developing.
8. Create projects, users, permissions, mappings, sidebar layout, and storage metadata through the UI or CLI.

Prefer CLI commands over hand-editing files or app-data rows.

## CLI Commands

Run commands from the repo root.

Setup:

```sh
pnpm basebuddy doctor
pnpm basebuddy doctor --json
pnpm basebuddy doctor --skip-db-check
pnpm basebuddy app-data:sql
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
pnpm basebuddy setup
pnpm basebuddy setup --owner-email owner@example.com --owner-name "Owner" --owner-password "strong-password"
pnpm setup:check
```

Users:

```sh
pnpm basebuddy users:list --json
pnpm basebuddy user:create --email editor@example.com --name "Editor" --password "strong-password"
pnpm basebuddy users:delete --email editor@example.com
```

Projects, members, and invites:

```sh
pnpm basebuddy projects:list --actor-email owner@example.com --json
pnpm basebuddy projects:create --actor-email owner@example.com --name "Docs" --slug docs
pnpm basebuddy projects:update --project docs --name "Docs Hub" --slug docs-hub
pnpm basebuddy projects:delete --project docs

pnpm basebuddy members:list --project docs --actor-email owner@example.com --json
pnpm basebuddy members:add --project docs --actor-email owner@example.com --email editor@example.com --roles editor
pnpm basebuddy members:update --project docs --actor-email owner@example.com --user-email editor@example.com --roles editor,author
pnpm basebuddy members:remove --project docs --actor-email owner@example.com --user-email editor@example.com

pnpm basebuddy invites:list --project docs --actor-email owner@example.com --json
pnpm basebuddy invites:create --project docs --actor-email owner@example.com --email viewer@example.com --roles viewer --json
pnpm basebuddy invites:revoke --project docs --actor-email owner@example.com --invitation-id invitation_id
```

Permissions:

```sh
pnpm basebuddy permissions:get --project docs --actor-email owner@example.com --json
pnpm basebuddy permissions:set --project docs --actor-email owner@example.com --user-email editor@example.com --allow mapping.write --deny project.delete
```

Mapping, sidebar, and storage:

```sh
pnpm basebuddy mapping:get --project docs --json
pnpm basebuddy mapping:validate --input mapping.json --json
pnpm basebuddy mapping:set --project docs --input mapping.json --binding-status ready --json

pnpm basebuddy sidebar:get --project docs --json
pnpm basebuddy sidebar:set --project docs --input sidebar.json --json
pnpm basebuddy sidebar:reset --project docs --json

pnpm basebuddy storage:status --json
pnpm basebuddy storage:get --project docs --library media --json
pnpm basebuddy storage:set --project docs --library media --provider supabase_bucket --bucket media
```

The CLI does not edit content rows, upload files, delete storage objects, run mapping
auto-detection, publish/unpublish/archive content, or manage deployment env values.

## Runtime Model

Mapping has three layers:

1. Storage contract: source table/path, storage primitive, value kind, list/single, nullable/required, editability, and patch mode.
2. Semantic role: optional meaning such as `title`, `content`, `slug`, `status`, `publishedAt`, or `featuredImage`.
3. UI: controls come from value kind first. Semantic roles refine labels and actions.

Do not let semantic labels override the real storage shape.

## Security Practices

- Keep `.env` and production env values private.
- Keep `basebuddy-data/` private because it contains local users, password hashes, session hashes, projects, permissions, invitations, mappings, and sidebar layout.
- Use strong owner passwords.
- Do not print secrets into docs, screenshots, logs, or issue reports.
- Before deleting users or projects, confirm the action is intended.
- Do not remove the last owner of a project.

## Verification

Use the smallest useful check for the change, and broaden when touching shared runtime behavior.

Common checks:

```sh
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm build
pnpm basebuddy doctor
pnpm basebuddy --help
```

For UI changes, also run the relevant browser or Playwright checks from `docs/testing.md`.

## Read Next

- Install and setup: `README.md`, `INSTALL.md`, `docs/getting-started.md`, `docs/onboarding.md`
- Config and env: `docs/configuration.md`
- CLI: `docs/cli.md`
- Projects and mapping: `docs/projects-and-mapping.md`
- Storage/UI rules: `docs/storage-ui-matrix.md`
- Permissions: `docs/permissions.md`
- Media and files: `docs/storage-and-media.md`
- Deployment and operations: `docs/deployment.md`, `docs/operations.md`
- Testing: `docs/testing.md`
- Security: `SECURITY.md`
- Troubleshooting: `docs/troubleshooting.md`

## Deployment and save safety

Use the included Dockerfile and Compose files for container installs. Run one app instance. Browser creation of the first owner requires an environment-only `BASEBUDDY_SETUP_TOKEN`; CLI setup remains available without it. Prepare database-backed app-data tables through explicit migrations before using a restricted runtime role. Normal reads never create tables.

App-data updates compare the current stored document or acquire a cross-process file lock. Updater callbacks must tolerate retries. Content writes lock the main row before patch reads. Keep saved-content version tokens separate from editable timestamp values. Never change user table schemas to add concurrency metadata.

Normal production builds compile test sign-in off. Run the database and Docker release checks in isolated test environments, and test app-data restoration before deployment.
