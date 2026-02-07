# Supabase CLI Setup & Migration Guide

This repo already contains the `supabase/` directory and the initial migration.
Follow these steps any time you need to authenticate with Supabase, link a project, 
and apply migrations locally or remotely.

> **Important:** Linegra does **not** ship with mock data or an in-app Supabase connection prompt. The UI refuses to load unless `SUPABASE_URL` and `SUPABASE_ANON_KEY` are present in your environment (e.g., `.env.local`). Complete the steps below before running `npm run dev`.

## 1. Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.216.8 or newer installed on your machine.
- Access to the Supabase project you created for Linegra.
- Node.js installed (for running the app after the database is ready).

You can confirm the CLI is available with:

```bash
supabase --version
```

## 2. Authenticate the CLI (one-time per machine)
Run the login command and follow the browser prompt:

```bash
supabase login
```

When prompted, paste the access token from the Supabase dashboard (Profile → Access Tokens).
After this step, the CLI stores credentials in `~/.supabase`.

## 3. Link the local repo to your Supabase project
Linking stores the project reference ID so future commands know which project to target.
Execute this from the repository root:

```bash
supabase link --project-ref <YOUR-PROJECT-REF>
```

You can find the project ref in the Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`).
This creates/updates `supabase/config.toml` with the reference.

## 4. Apply migrations locally (for dev/testing)
Start the local Supabase stack (database, auth, storage, etc.):

```bash
supabase start
```

To recreate the local database from scratch—useful when the schema changes—run:

```bash
supabase db reset
```

`db reset` drops the local database, runs every SQL file in `supabase/migrations/`, and then executes `supabase/seed.sql` (currently a placeholder).

The familiar dev loop is:
1. `supabase start`
2. `supabase db reset`
3. Run the Linegra app (`npm run dev`) pointing to `http://127.0.0.1:54321` via your `SUPABASE_URL`/`SUPABASE_ANON_KEY`.

Stop the Supabase stack when finished:

```bash
supabase stop
```

## 5. Push migrations to the hosted Supabase project
After linking, apply the same migrations to the cloud database with:

```bash
supabase db push
```

This sends all unapplied SQL files in `supabase/migrations/` to the remote project in order.

> If you need to inspect differences before pushing, run `supabase migration status`.

## 6. Creating new migrations (when the schema changes)
Whenever you modify the schema locally (e.g., via `psql`), capture the delta as a migration:

```bash
supabase migration new <short-description>
# edit the generated SQL file under supabase/migrations/
```

After editing, re-run `supabase db reset` locally and `supabase db push` to sync remote state.

## 7. Environment variables for the frontend
Ensure `.env.local` (excluded from git) contains the Supabase credentials for the environment you are targeting:

```
SUPABASE_URL=<https://your-project.supabase.co>
SUPABASE_ANON_KEY=<public-anon-key>
```

For Vercel, set the same values in the project settings (Environment Variables → Production/Preview) so builds use the correct Supabase instance.

---
Need help rotating keys or setting up storage buckets? Ping the team before changing any schema files so migrations stay linear.
