# CI/CD Checks

To keep deploys green, the Vercel build should fail early if linting, TypeScript
checking, or unit tests break. Run these commands locally before pushing or let the CI call them.

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
