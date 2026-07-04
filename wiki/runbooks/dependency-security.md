# Runbook: Dependency security

Linegra is a small npm frontend — most CVE surface is **dev tooling** (Vite, ESLint, Vitest) plus
**@supabase/supabase-js** at runtime. There is no server-side Node app in this repo; production is
static assets + Supabase Edge Functions (Deno, separate from `package.json`).

## Weekly hygiene

```bash
npm audit              # or: npm run audit
npm outdated           # spot stale direct deps
make check             # full gate after any bump
```

After `npm audit fix`, re-run `npm audit` — some issues need a **direct** `package.json` bump
(e.g. pinned `@supabase/supabase-js`, Vitest major for nested Vite/esbuild).

## What we upgrade deliberately

| Package | Role | Policy |
|---------|------|--------|
| `@supabase/supabase-js` | Runtime API client | Stay on latest **2.x**; fixes auth-js routing CVEs |
| `react` / `react-dom` | Runtime UI | Patch/minor within 19.x |
| `vite` | Build + dev server | Latest **6.x** patch (esbuild dev-server CVE is dev-only) |
| `vitest` | Unit tests | Align with Vite peer range (Vitest 4 + Vite 6 as of 2026-07) |
| `eslint` / `@typescript-eslint/*` | Lint | Patch/minor within current major; ESLint 10 is a separate migration |
| `typescript` | Typecheck | Stay on 5.8.x until ESLint/Vite ecosystem supports 6 |

**Defer major jumps** (`vite` 8, `eslint` 10, `typescript` 6, `lucide-react` 1.x) to focused PRs —
not mixed with security patches.

## Automated PRs

[../../.github/dependabot.yml](../../.github/dependabot.yml) opens weekly grouped updates for npm.
Review CI (`make build` on Vercel) before merging.

## Dev-only vs production risk

- **esbuild / Vite dev-server CVEs** affect `npm run dev` only — not the shipped `dist/` bundle.
  Still patch promptly; do not expose the dev server to untrusted networks.
- **ESLint / Vitest / Rollup** CVEs affect CI and local tooling, not end users.
- **@supabase/supabase-js** is the main **runtime** dependency in the browser bundle — prioritize
  its updates.

## Edge Functions (Deno)

`supabase/functions/*` does not use `package.json`. Audit Deno imports separately when touching
ai-proxy or other functions.

## When audit is clean but you still want assurance

1. `npm ls <package>` — confirm a single resolved version (no duplicate nested majors).
2. `make build` — lint + tsc + 325+ tests + production bundle.
3. Smoke-test auth + pedigree load after `@supabase/supabase-js` bumps.

Related: [build-test-deploy.md](build-test-deploy.md), [../log.md](../log.md).
