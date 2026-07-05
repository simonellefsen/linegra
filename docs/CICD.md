# CI/CD Checks

GitHub Actions runs on every push to `main` and on pull requests
([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

The required status check name is **`build`**.

## Local pre-push gate

Husky runs `npm run build` on `git push`, which chains lint, typecheck, tests, and
`vite build`. Run these while iterating:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` runs lint, type checks, **and the Vitest unit suite** under the hood before
`vite build` (see `package.json`). So a failing test now blocks the build — and therefore the
Vercel deploy. Run `npm test` (or `npm run test:watch`) directly while iterating; tests live
next to the code they cover as `lib/*.test.ts`.

## E2E smoke (roadmap X)

Playwright smoke pack for browser flows Vitest cannot cover:

```bash
npx playwright install chromium   # once per machine
npm run test:e2e:local            # built SPA on :4173
E2E_BASE_URL=https://<preview>.vercel.app npm run test:e2e:deployed
npm run test:e2e                  # both projects
```

Deployed smoke **must** target a Vercel deployment (preview or production) so `/api/public/*`
and `/sitemap.xml` edge routes are available. Local `vite preview` does not serve those APIs.

### CI (`e2e-smoke` job)

After `build`, the workflow waits for the matching Vercel deployment
(`patrickedqvist/wait-for-vercel-preview`) and sets `E2E_BASE_URL` to that URL before running
Playwright.

### E2E access tokens (authenticated smoke)

Superadmins mint revocable tokens under **Admin → Errors → E2E access tokens**. Playwright redeems
them via `POST /api/e2e/redeem` (server signs in the dedicated service user).

| Where | Name | Purpose |
|-------|------|---------|
| GitHub secret | `E2E_ACCESS_TOKEN` | Minted `lg_e2e_…` token for CI auth bootstrap |
| GitHub variable | `SUPABASE_URL` | Storage key for Playwright `storageState` (same as Vercel) |
| GitHub secret (optional) | `E2E_PROFILE_PATH` | Public person path for profile smoke |
| Vercel env | `E2E_SERVICE_USER_EMAIL` | Dedicated E2E runner account |
| Vercel env | `E2E_SERVICE_USER_PASSWORD` | Service user password |
| Vercel env | `SUPABASE_SERVICE_ROLE_KEY` | Redeem route consumes tokens + signs in |

Local bootstrap (optional):

```bash
E2E_BASE_URL=https://<preview>.vercel.app \
E2E_ACCESS_TOKEN=lg_e2e_… \
SUPABASE_URL=https://<ref>.supabase.co \
node scripts/e2e-bootstrap-session.mjs
```

CI runs `e2e-smoke` after the unit `build` job (local SPA + deployed public APIs on Vercel).

## Require CI on `main` (roadmap W2) — **active**

Ruleset **Require CI on main** is enforced on the default branch (`build` must be green).
Verify anytime:

```bash
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/rulesets" \
  --jq '.[] | select(.name=="Require CI on main") | {id, enforcement, name}'
```

To inspect the required check:

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
RULESET_ID=$(gh api "repos/$OWNER_REPO/rulesets" --jq '.[] | select(.name=="Require CI on main") | .id')
gh api "repos/$OWNER_REPO/rulesets/$RULESET_ID" \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks'
```

If missing, a repo admin can create it with:

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api "repos/$OWNER_REPO/rulesets" -X POST --input - <<'EOF'
{
  "name": "Require CI on main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "build" }]
      }
    }
  ]
}
EOF
```

Or use **Settings → Rules → Rulesets** in GitHub and require the `build` check on `main`.
