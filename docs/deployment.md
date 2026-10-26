# Deployment

Run one BaseBuddy app instance behind HTTPS. The included Docker image runs as user `10001` and connects to your existing Postgres or Supabase content database. It does not install a content schema.

## Configure the install

Clone the public repository and create the environment file:

```sh
git clone https://github.com/stack127labs/basebuddy.git
cd basebuddy
cp .env.example .env
chmod 600 .env
```

Set `BASEBUDDY_AUTH_SECRET` and `BASEBUDDY_CONTENT_DATABASE_URL` in `.env`. For browser setup, also set `BASEBUDDY_SETUP_TOKEN` to at least 32 random characters. Generate each secret separately:

```sh
openssl rand -hex 32
```

Keep these values private. Enter the setup token on the account step in `/onboarding`. CLI setup can create the owner without a setup token. Create the owner before allowing public traffic to an uninitialized installation.

The default `basebuddy-data` backend uses a named Docker volume at `/app/basebuddy-data`. For database-backed app data, set the backend and database environment values described in [App data storage options](./app-data-storage-options.md).

For database-backed app data, prepare the two BaseBuddy tables before creating the owner. Use a migration account with schema creation permission:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If the runtime account cannot create schemas or tables, use `pnpm basebuddy app-data:sql` and apply the printed SQL as an administrator. Runtime accounts need schema `USAGE`, `SELECT`, `INSERT`, and `UPDATE` on `basebuddy.app_state`, and `INSERT` on `basebuddy.audit_events`. Normal reads and writes do not run migrations.

## Start Docker

```sh
docker compose up -d --build
```

The default port is `127.0.0.1:8080`. Open `http://localhost:8080/onboarding` on the server, or use an SSH tunnel from your computer. The named volume survives container replacement. Do not use `docker compose down --volumes` on an installation you need to keep.

For an existing bind-mounted data directory, make its contents readable and writable by container user `10001`. Back it up before changing ownership. Never fix a permission problem by making app data publicly writable.

Run diagnostics inside the container:

```sh
docker compose exec basebuddy pnpm basebuddy doctor --json
docker compose exec basebuddy pnpm setup:check
```

`GET /api/health` returns `200` when the process runs. `GET /api/ready` returns `200` only after setup and the content database checks pass. An unfinished or unavailable install returns `503`. These routes do not return private setup details.

## Enable HTTPS

If you already have an HTTPS proxy, forward traffic to port `8080`. Replace client-supplied forwarding headers at the proxy and set upload limits for your installation.

An optional Caddy configuration is included. Point your domain at the server, set `BASEBUDDY_DOMAIN` in `.env`, and make ports `80` and `443` available. Then run:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
```

Caddy forwards to the app and keeps its certificates in named volumes. Complete owner setup before exposing the domain, or require the configured setup token. Use the same Compose file arguments for later HTTPS upgrades and shutdowns.

## Verify and upgrade

Sign in, open a project, check its saved mapping, and verify a mapped content read. Follow [Operations](./operations.md) to back up app data, test restoration, and keep a rollback image before upgrades.

Database-backed app data supports durable configuration and concurrent app/CLI writes. Run a single app instance. Editor presence, caches, and in-app request limits are still process-local.
