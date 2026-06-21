# Runbook: Supabase migrations

Schema-first: apply migrations **before** shipping code that depends on new tables/RPCs. Full
CLI auth/link details in [../../docs/SUPABASE_SETUP.md](../../docs/SUPABASE_SETUP.md).

## Create a migration

1. Add a file under [../../supabase/migrations/](../../supabase/migrations/) named
   `YYYYMMDDHHMMSS_short_description.sql` (timestamps keep ordering deterministic).
2. Write forward-only SQL. Prefer idempotent forms (`create or replace function`,
   `create ... if not exists`) where practical.
3. **New table?** You must:
   - `alter table public.<t> enable row level security;`
   - add `select` + write policies using `can_read_tree` / `can_write_tree` (or an `exists`
     join to the owning person's tree for child tables). See
     [../decisions/supabase-rls-can-read-write.md](../decisions/supabase-rls-can-read-write.md).
4. Mirror the change in [../../types.ts](../../types.ts) and update [../schema.md](../schema.md).

## Apply

```bash
supabase login            # one-time
supabase link --project-ref <ref>
supabase db push          # apply pending migrations to the linked project
```

## After applying

- If you changed a **function signature** and PostgREST returns `function does not exist` or a
  stale schema, force a schema-cache reload (there is a `reload_schema_cache` migration
  precedent in the history). 
- Run the app and exercise the affected admin path; confirm `audit_logs` rows appear for
  mutations.

## Destructive operations

- `admin_nuke_database` / the Admin "nuke" modal performs a guarded full reset
  ([../../components/admin/AdminNukeModal.tsx](../../components/admin/AdminNukeModal.tsx)).
  **Do not run against a real archive.** It requires an explicit confirmation token.

## Gotchas

- Keep `jsonb_object_length` shim — it works around a PG-version error used by DNA/relationship
  metadata logic.
- Tree deletes can be slow on large trees; performance/timeout fixes already exist in the
  migration history — don't reintroduce synchronous cascade deletes without batching.
