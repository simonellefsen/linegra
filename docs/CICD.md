# CI/CD Checks

To keep deploys green, the Vercel build should fail early if linting or TypeScript
checking breaks. Run these commands locally before pushing or let the CI call them.

```bash
npm run lint
npm run typecheck
npm run build
```

`npm run build` already runs both lint and type checks under the hood (see package.json).
