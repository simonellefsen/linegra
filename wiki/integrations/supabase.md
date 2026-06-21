# Integration: Supabase

Supabase **is** the backend: Postgres + PostgREST + RPC + RLS + (intended) Auth. The app has
no other server. Setup guide: [../../docs/SUPABASE_SETUP.md](../../docs/SUPABASE_SETUP.md).

## Client boot

- Created in [../../lib/supabase.ts](../../lib/supabase.ts) from `SUPABASE_URL` +
  `SUPABASE_PUBLISHABLE_KEY` (build-time env via Vite). The app **refuses to render** without
  both — there is no in-app connection form and no mock archive.
- All data access goes through [../../services/archive.ts](../../services/archive.ts) (and
  [../../services/ai.ts](../../services/ai.ts) for AI settings RPCs).

## Authorization

- RLS is the boundary — `can_read_tree` / `can_write_tree`. See
  [../decisions/supabase-rls-can-read-write.md](../decisions/supabase-rls-can-read-write.md)
  and [../schema.md](../schema.md).
- **Never put a service-role key in the client.** Use the publishable/anon key; let RLS gate.

## Data access habits

- **Reads:** paged selects + RPC summaries; no full-tree hydration (see
  [../concepts/public-first-genealogy.md](../concepts/public-first-genealogy.md)).
- **Writes:** prefer `admin_*` RPCs so authz + audit logging are centralized; they write to
  `audit_logs`.
- **Schema cache:** after migrations that change function signatures, PostgREST may need a
  schema reload (there is a `reload_schema_cache` migration precedent).

## Migration workflow

- Migrations live in [../../supabase/migrations/](../../supabase/migrations/), seed in
  `supabase/seed.sql`, config in `supabase/config.toml`.
- **Schema-first:** apply `supabase db push` before shipping code that depends on new
  tables/RPCs. Full steps: [../runbooks/supabase-migrations.md](../runbooks/supabase-migrations.md).
- Name migrations `YYYYMMDDHHMMSS_description.sql`; keep them forward-only and idempotent where
  practical.

## Gotchas

- `jsonb_object_length` compat shim exists because of a runtime error on certain PG versions —
  don't remove it without checking DNA/relationship metadata code paths.
- The local super-admin is **not** a real `auth.users` row, so collaborator RLS branches are
  dormant — see [../decisions/local-superadmin-auth.md](../decisions/local-superadmin-auth.md).
