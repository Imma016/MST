# Automatic Supabase migrations

MST uses GitHub Actions to apply SQL migrations from `supabase/migrations/`. This avoids needing a local network connection to Supabase's PostgreSQL pooler. The standard GitHub-hosted runner is free for this public repository.

## One-time setup

After `.github/workflows/supabase-migrations.yml` is on the repository's `main` branch:

1. In GitHub, open **Settings → Secrets and variables → Actions**.
2. Add repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. Generate the Supabase personal access token in the Supabase account dashboard; never commit either value or paste it into a message.
3. Open **Actions → Apply Supabase migrations → Run workflow**. Select the `main` branch and check **Register migrations previously run in SQL Editor**. This marks versions `202611050001`, `202611050002`, and `202611050003` as already applied, then applies the pending Books migration.
4. After the workflow succeeds, add the repository variable `SUPABASE_MIGRATIONS_BASELINED` with value `true` under **Settings → Secrets and variables → Actions → Variables**.

The variable prevents the automatic push trigger from running until the manually applied migrations have been registered. After that, future migration files pushed to `main` are applied automatically. Manual workflow runs can still be started from the Actions tab.

If setup credentials are absent, the workflow will fail without changing the database. Review its log in **Actions**; GitHub masks secret values in logs.
