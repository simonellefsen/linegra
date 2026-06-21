# Decision: Single local super-admin (multi-user deferred)

**Decision.** The current release ships a **single local super-administrator** account, not
Supabase Auth user accounts. Bootstrap credentials are `linegra` / `linegra`; on first login
the admin is forced to set a new username/password, stored in browser/Electron `localStorage`.
Anonymous visitors are read-only. Multi-user registration is **not yet available**.

Code: [../../components/AuthModal.tsx](../../components/AuthModal.tsx),
[../../lib/adminAuth.ts](../../lib/adminAuth.ts), [../../App.tsx](../../App.tsx).

## Why (for now)

- **Ship the archive first.** A single curator covers the initial use case (one researcher's
  trees) without building registration, invites, and account recovery.
- **Low friction.** No email/OAuth setup required to start editing.

## Local-dev convenience (2026-06-20)

On a local-dev host (`localhost` / `127.0.0.1` / `0.0.0.0` / `::1` / `*.local`),
[../../lib/adminAuth.ts](../../lib/adminAuth.ts) (`isLocalDevHost`):

- accepts **`admin` / `admin`** (and the `linegra` / `linegra` bootstrap) as a one-step login —
  `verifyAdminCredentials` blesses these dev pairs even if localStorage holds other custom creds;
- **skips the forced reset** for them (`mustReset` normalized to `false`); and
- bootstraps a fresh localhost install to the `admin` account (so the login modal hints `admin`).

All of this is evaluated at runtime from `window.location.hostname`, so **deployed builds on a
real domain are never affected** — there the forced reset still secures the default account and
only stored credentials are accepted. This exists purely to make local verification / iteration
friction-free (e.g. driving the DNA-tab badge check via agent-browser). See
[../runbooks/build-test-deploy.md](../runbooks/build-test-deploy.md).

## Known limitations (important)

- Credentials live in `localStorage` — clearing storage or moving machines requires
  re-bootstrapping; this is **not** a real `auth.users` identity.
- Because there's no real `auth.uid()`, the collaborator-aware branches of
  `can_read_tree`/`can_write_tree` ([supabase-rls-can-read-write.md](supabase-rls-can-read-write.md))
  can't be exercised by end users yet — RLS effectively distinguishes public vs admin only.
- No invite/role management UI despite `tree_collaborators` existing in the schema.

## The intended successor

Wire **Supabase Auth** (email/OAuth) → real `profiles`, migrate the super-admin onto a real
account, and build a collaborators panel on top of the existing RLS. This is **roadmap item A**
([../roadmap.md](../roadmap.md)) and the highest-leverage change available.

## Alternatives rejected (for the initial release)

- **Full Supabase Auth + registration up front** — more scope than the first use case needed.
- **No auth at all** — unacceptable; editing must be gated.
