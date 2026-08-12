# Changelog

All notable public changes to BaseBuddy will be documented here.

This project follows a practical changelog format. Dates use `YYYY-MM-DD`.

## Unreleased

No unreleased changes yet.

## 0.2.0 - App Data Backend Setup Flow - 2026-05-31

### Added

- First-run onboarding now starts with a BaseBuddy app-data storage choice.
- Added support for three app-data backends: `basebuddy-data/`, the same Supabase/Postgres database as content, or a separate Supabase/Postgres database.
- Added CLI commands for DB-backed app data: `pnpm basebuddy app-data:sql`, `pnpm basebuddy app-data:migrate`, and `pnpm basebuddy app-data:check`.
- Added setup guidance for preparing the BaseBuddy-owned `basebuddy.app_state` and `basebuddy.audit_events` tables.
- Added a detailed app-data storage comparison doc for choosing between the three backend options.

### Changed

- Setup, CLI, install, configuration, and deployment docs now explain when to use `basebuddy-data/` and when to use DB-backed app data.
- Public agent instructions now include the app-data migration/check flow so AI agents can set up DB-backed installs without guessing.

## 0.1.0 - Initial Public Release - 2026-05-30

### Added

- BaseBuddy self-host app for mapping existing Supabase and Postgres schemas into an editor.
- Public self-host documentation for installation, configuration, mapping, editing, permissions, deployment, operations, security, and troubleshooting.
- Support guides for common setup and editing tasks.
- Hosted demo deployment path for `demo.basebuddy.version127.com`.
- Public website deployment path for `basebuddy.version127.com`.
- Project mapping flow for posts, authors, categories, tags, media, files, SEO fields, status fields, and sidebar fields.
- Safe editing model where normal save writes dirty fields only.
- Explicit publish, unpublish, and archive actions.
- Role-based and user-specific permission controls.
- Supabase and S3-compatible storage support through saved mappings.
- Setup checker for validating required self-host environment and database configuration.
- Example environment files for local setup and Playwright testing.

### Changed

- Public repository metadata now points to `https://basebuddy.version127.com`, `https://demo.basebuddy.version127.com`, and `https://github.com/version127/basebuddy`.
