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

## Require CI on `main` (roadmap W2)

Branch protection is not enabled yet. To block merges until `build` is green (Dependabot
included), a repo admin can create a ruleset:

```bash
gh api repos/{owner}/{repo}/rulesets -X POST --input - <<'EOF'
{
  "name": "Require CI on main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
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
