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
