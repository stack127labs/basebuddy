# Onboarding

`/onboarding` is the first-run setup screen. It creates the selected BaseBuddy app-data backend after required secrets are present in env.

Onboarding asks for:

- required env values for auth signing, app-data backend selection, and database access;
- the server setup token, owner name, email, and password;
- setup checks that run automatically.

The setup flow is:

1. **Choose where to store BaseBuddy data**
2. **Connect to your database**
3. **Prepare BaseBuddy data tables** when Supabase/Postgres app data is selected
4. **Create account on BaseBuddy**
5. **Let's check the setup now**

Onboarding shows the required env keys for auth signing and content database access. It does not collect database URLs or service keys into app data. The checks verify app data, owner account, env values, database role, and database connection.

It does not ask users to choose custom paths or configure an external auth provider. If users choose Supabase/Postgres app data, BaseBuddy uses only the BaseBuddy-owned `basebuddy` schema. [App Data Storage Options](./app-data-storage-options.md) explains the differences between `basebuddy-data/`, a new Supabase/Postgres database, and the same database as your content.

Onboarding asks users to run:

```sh
pnpm basebuddy app-data:migrate
pnpm basebuddy app-data:check
```

If the app-data database role cannot create schemas or tables, use:

```sh
pnpm basebuddy app-data:sql
```

Then run the printed SQL in the database SQL editor.

Set `BASEBUDDY_SETUP_TOKEN` to at least 32 random characters on the server before browser setup. Enter it in **Setup token** on the account step. It authorizes creation of the first owner. CLI setup can create the owner privately without this token.

## Ready State

Setup is ready when app data exists, validates, has at least one owner user, required env values are present, and the content database connection succeeds.

Use:

```sh
pnpm setup:check
pnpm basebuddy doctor
```

## After Onboarding

Sign in, create a project, save a mapping, then reload to confirm the saved mapping remains the runtime truth.
