# Runbook: Build, test, deploy

## The build gate (never skip)

`npm run build` chains **lint → typecheck → vite build**:

```bash
npm install          # first time / after dep changes
npm run dev          # local dev server (Vite, port 3000)
npm run lint         # eslint . --max-warnings=0   (zero warnings allowed)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit tests for pure logic)
npm run test:watch   # vitest in watch mode
npm run build        # runs lint + typecheck + vite build
npm run preview      # serve the production build locally
```

Lint, typecheck, **unit tests**, and vite build **must all pass** before handoff — Vercel
enforces the same. `npm test` (Vitest) is **wired into `npm run build`**
(`lint → typecheck → test → vite build`), so a failing test blocks the deploy. Tests live next
to the code as `lib/*.test.ts` and cover the pure logic (DNA parsing/classification, GEDCOM
parsing, place parsing, AI cache).

> **Fixtures are gitignored.** `*.ged` / `*.csv` are not committed, so they are absent in CI.
> Unit tests use inline synthetic data; the real-fixture GEDCOM smoke test uses
> `describe.skipIf` and is skipped on Vercel. Never write a build-gated test that *requires* a
> gitignored fixture.

### Local dev against the real Supabase DB

`npm run dev` reads `.env.local` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`OPENROUTER_API_KEY`) and connects straight to the remote Supabase project, so you can iterate
on localhost before commit & push. To screenshot/inspect it headlessly:

```bash
agent-browser --session linegra open http://localhost:3000/
agent-browser --session linegra wait 3500
agent-browser --session linegra screenshot /tmp/linegra-local.png
agent-browser --session linegra snapshot           # accessibility tree
```

**Admin login on localhost is one step.** On a local-dev host (`localhost`/`127.0.0.1`/`.local`)
you can sign in with **`admin` / `admin`** (or the `linegra` / `linegra` bootstrap) and it lands
you straight in the admin workspace — no forced-reset modal (see
[../decisions/local-superadmin-auth.md](../decisions/local-superadmin-auth.md)). On any real host
the forced reset still applies and only stored credentials work. Driving it via agent-browser:

```bash
agent-browser --session linegra click '<Login button ref>'
agent-browser --session linegra fill '<username ref>' admin
agent-browser --session linegra fill '<password ref>' admin
agent-browser --session linegra click '<Sign In ref>'      # logged in, no reset prompt
```

Grab refs with `agent-browser --session linegra snapshot`. To force a fresh login, clear the
session first: `agent-browser --session linegra eval "localStorage.clear()"` then reload (the
session lives in the `LINEGRA_SUPERADMIN` key; credentials in `LINEGRA_SUPER_ADMIN`). This is how
the DNA-tab lineage badge was verified end-to-end against real data.

## Pre-handoff checklist

1. `npm run build` is green.
2. Behavior change documented: update the relevant `wiki/` page + add a [../log.md](../log.md)
   entry; keep [../../docs/CONTENT_MAP.md](../../docs/CONTENT_MAP.md) in sync if navigation changed.
3. Schema change? Migration applied (see [supabase-migrations.md](supabase-migrations.md)) and
   [../schema.md](../schema.md) updated.
4. No service-role key or secret committed; envs come from `.env.local` / Vercel project env.

## Deploy (Vercel)

- Deploys build from the repo; the Vercel build command runs the same lint+typecheck+build.
- Required project env vars: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY`.
- CI/CD notes: [../../docs/CICD.md](../../docs/CICD.md).

## Common failures

- **Lint fails on a warning** — `--max-warnings=0` means warnings are errors. Fix, don't suppress.
- **App renders blank** — almost always missing `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`
  (boot gate). Check env before debugging UI.
- **PostgREST 404/`function does not exist`** after a migration — schema cache may need a
  reload; see [supabase-migrations.md](supabase-migrations.md).
