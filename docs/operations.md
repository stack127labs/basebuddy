# Operations

Back up BaseBuddy app data, environment secrets, and the content database separately. App data contains users, password hashes, session hashes, projects, permissions, mappings, sidebar layout, invitations, and audit history. Keep backups private.

## Before an upgrade

1. Record the current release commit and keep its Docker image under a rollback tag.
2. Stop scheduled writers and avoid configuration changes while taking the backup.
3. Back up the app-data backend using the appropriate procedure below.
4. Back up environment values through your secret manager. Keep the same auth secret when restoring sessions.
5. Back up the content database and mapped object storage through their own backup systems.
6. Restore the app-data backup into an isolated test install and run diagnostics before replacing production.

## Back up file-based app data

With the standard Compose configuration:

```sh
umask 077
docker compose exec -T basebuddy tar -czf - -C /app/basebuddy-data . > basebuddy-app-data.tar.gz
```

This includes the config and audit log. Keep the archive outside the repository. Do not publish it or attach it to a support request.

To test restoration, use a separate empty directory with the same Compose files and its own project name. Set its environment values privately. Restore the archive into that project's new data volume:

```sh
docker compose -p basebuddy-restore run --rm --no-deps -T --entrypoint tar basebuddy -xzf - -C /app/basebuddy-data < basebuddy-app-data.tar.gz
docker compose -p basebuddy-restore up -d
docker compose -p basebuddy-restore exec basebuddy pnpm basebuddy doctor --json
```

Use a different `BASEBUDDY_PORT` for the isolated install. Confirm login, project listing, and mapping reads. Keep it private and do not edit production content during the drill. Shut down the isolated install after verification. Remove only the test volumes you created.

## Back up database app data

Back up the `basebuddy.app_state` and `basebuddy.audit_events` tables with your database backup system. Restore both into an isolated database, select that database in the test install, and run `app-data:check` and `doctor`. Database URLs and credentials stay in environment variables or your secret manager.

A backup of BaseBuddy app data does not include the user content tables or stored media. Back those up separately.

## Deploy and check

Deploy the tested release, keeping its persistent app-data volume and environment values. Apply any documented app-data migration with the migration role before starting the runtime role.

Check:

```sh
docker compose exec basebuddy pnpm basebuddy doctor --json
docker compose exec basebuddy pnpm setup:check
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8080/api/ready
```

Then verify sign-in, a project read, and its saved mapping. Open editor tabs should reload after an upgrade so their save requests use the current conflict tokens.

## Rollback

Stop the new app and restore the previous image. Restore the matching app-data backup if the release changed its format or configuration. Preserve environment values and volume ownership. Restore content rows only when they changed and need a separate content rollback.

Normal production images keep test sign-in disabled at build time. Never deploy a Playwright test build or copy `.env.playwright` into production.
