# Decision: RLS is the authorization boundary

**Decision.** All authorization is enforced in Postgres via Row-Level Security, using two
`security definer` predicates — `can_read_tree(tree_id)` and `can_write_tree(tree_id)`. There
is no application server enforcing access; the React app talks to Supabase PostgREST/RPC
directly, and RLS is what makes that safe.

## Rules encoded

- **Read** a tree if it `is_public`, OR the caller is `owner_id`, OR an `active` collaborator
  (`tree_collaborators`).
- **Write** only if authenticated AND (owner OR active `owner`/`editor` collaborator).
- Child tables (events, citations, media links) check via an `exists` join to the owning
  person's tree, so policies stay consistent.

See the predicates and policies in
[../../supabase/migrations/20260207090000_init_schema.sql](../../supabase/migrations/20260207090000_init_schema.sql)
and the summary in [../schema.md](../schema.md).

## Why

- **No backend to run.** Supabase provides auth + Postgres + PostgREST; pushing authz into RLS
  removes a whole server tier and keeps a single source of truth.
- **Defense in depth.** Even if the client is buggy or hostile, the database refuses
  unauthorized rows.
- **Public-first fits.** `is_public` at the tree level cleanly enables anonymous browsing.

## Alternatives rejected

- **App-layer authz in a Node/edge server** — more infra, duplicate logic, easy to drift.
- **Client-side gating only** — unsafe; client checks are convenience, not security.

## Consequences / rules for contributors

- **Never add a write path that bypasses RLS** (e.g. a service-role key in the client). Route
  mutations through audited RPCs (`admin_*`) and let RLS check.
- New tables **must** `enable row level security` and add matching `can_*_tree` policies.
- UI permission checks are UX only — assume they can be bypassed.
- Test policies as anon, owner, and collaborator roles when changing them.

Related: [../concepts/public-first-genealogy.md](../concepts/public-first-genealogy.md),
[local-superadmin-auth.md](local-superadmin-auth.md) (note: current local super-admin does not
yet use real `auth.users`, which limits collaborator RLS in practice — see
[../roadmap.md](../roadmap.md)).
