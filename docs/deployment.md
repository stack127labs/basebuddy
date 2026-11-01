# Deployment

Run one BaseBuddy app instance behind HTTPS. The BaseBuddy Docker image runs as user `10001` and connects to your existing Postgres or Supabase content database. It does not install a content schema.

## Get the release files

BaseBuddy publishes a ready-made image for `linux/amd64` and `linux/arm64`:

```text
ghcr.io/stack127labs/basebuddy:0.2.2
```

Tags: `0.2.2` is one exact release, `0.2` follows patch releases of `0.2`, and `latest` follows the newest release. Pin an exact version in production so upgrades are deliberate.

You only need `compose.yaml` and `.env.example`. Download them for the release you want:

```sh
mkdir basebuddy && cd basebuddy
curl -fsSLO https://raw.githubusercontent.com/stack127labs/basebuddy/v0.2.2/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/stack127labs/basebuddy/v0.2.2/.env.example
chmod 600 .env
```

Or clone the repository at that tag, which also includes the optional Caddy HTTPS files:

```sh
git clone --branch v0.2.2 https://github.com/stack127labs/basebuddy.git
cd basebuddy
cp .env.example .env
chmod 600 .env
```

## Configure the install

Set `BASEBUDDY_AUTH_SECRET` and `BASEBUDDY_CONTENT_DATABASE_URL` in `.env`. For browser setup, also set `BASEBUDDY_SETUP_TOKEN` to at least 32 random characters. Generate each secret separately:

```sh
openssl rand -hex 32
```

Keep these values private. Enter the setup token on the account step in `/onboarding`. CLI setup can create the owner without a setup token. Create the owner before allowing public traffic to an uninitialized installation.

All settings are read when the container starts, so the same published image works for every install. Change `.env`, then run `docker compose up -d` to apply it.

The default `basebuddy-data` backend uses a named Docker volume at `/app/basebuddy-data`. For database-backed app data, set the backend and database environment values described in [App data storage options](./app-data-storage-options.md).

For database-backed app data, prepare the two BaseBuddy tables before creating the owner. Use a migration account with schema creation permission:

```sh
docker compose run --rm basebuddy pnpm basebuddy app-data:migrate
docker compose run --rm basebuddy pnpm basebuddy app-data:check
```

If the runtime account cannot create schemas or tables, use `docker compose run --rm basebuddy pnpm basebuddy app-data:sql` and apply the printed SQL as an administrator. Runtime accounts need schema `USAGE`, `SELECT`, `INSERT`, and `UPDATE` on `basebuddy.app_state`, and `INSERT` on `basebuddy.audit_events`. Normal reads and writes do not run migrations.

## Start Docker

```sh
docker compose pull
docker compose up -d
```

The default port is `127.0.0.1:8080`. Open `http://localhost:8080/onboarding` on the server, or use an SSH tunnel from your computer. The named volume survives container replacement. Do not use `docker compose down --volumes` on an installation you need to keep.

To run the image without Compose, keep the same volume and env file:

```sh
docker volume create basebuddy-data
docker run -d --name basebuddy --restart unless-stopped --init \
  --env-file .env -p 127.0.0.1:8080:8080 \
  -v basebuddy-data:/app/basebuddy-data \
  --cap-drop ALL --security-opt no-new-privileges:true \
  ghcr.io/stack127labs/basebuddy:0.2.2
```

For an existing bind-mounted data directory, make its contents readable and writable by container user `10001`. Back it up before changing ownership. Never fix a permission problem by making app data publicly writable.

Run diagnostics inside the container:

```sh
docker compose exec basebuddy pnpm basebuddy doctor --json
docker compose exec basebuddy pnpm setup:check
```

`GET /api/health` returns `200` when the process runs. `GET /api/ready` returns `200` only after setup and the content database checks pass. An unfinished or unavailable install returns `503`. These routes do not return private setup details.

## Build from source

To build the image from a checkout instead of pulling it, add `compose.build.yaml`:

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

This tags the local image as `basebuddy:local`. Use the same file arguments for later commands on that install.

## Enable HTTPS

If you already have an HTTPS proxy, forward traffic to port `8080`. Replace client-supplied forwarding headers at the proxy and set upload limits for your installation.

An optional Caddy configuration is included. Point your domain at the server, set `BASEBUDDY_DOMAIN` in `.env`, and make ports `80` and `443` available. Then run:

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d
```

Caddy forwards to the app and keeps its certificates in named volumes. Complete owner setup before exposing the domain, or require the configured setup token. Use the same Compose file arguments for later HTTPS upgrades and shutdowns.

## Verify and upgrade

Sign in, open a project, check its saved mapping, and verify a mapped content read. Follow [Operations](./operations.md) to back up app data, test restoration, and keep a rollback image before upgrades.

To upgrade, back up first, then set the new version in `compose.yaml` (or set `BASEBUDDY_IMAGE` in `.env`) and run:

```sh
docker compose pull
docker compose up -d
```

Keep the previous image tag written down. To roll back, set the old tag again and run the same two commands.

Database-backed app data supports durable configuration and concurrent app/CLI writes. Run a single app instance. Editor presence, caches, and in-app request limits are still process-local.
