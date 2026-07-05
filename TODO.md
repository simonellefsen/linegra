# TODO — open tasks from the 2026-07-04/05 project review

Findings from the engineering review (2026-07-04) and the bot/LLM traversal audit (2026-07-05).
Details live in [wiki/roadmap.md](wiki/roadmap.md) (letters below) and
[wiki/sources/crawler-agent-discoverability.md](wiki/sources/crawler-agent-discoverability.md).
Check items off here; when a slice ships, also update the roadmap entry and add a
[wiki/log.md](wiki/log.md) entry (newest at top).

## Bugs (fix first)

- [ ] **U17a — Wrong kinship labels on public person pages.** Children/siblings are labeled with
      the *parent's* role ("Anne King (Father)" under Children; `- Father: [Anne King]` in
      Markdown; contradictory `rel`/`relationshipLabel` in JSON). Fix labels in
      `lib/publicCrawlRelations.ts` + assert labels in the test. *(Background-task chip spawned
      2026-07-05.)*
- [ ] **V4 — Both OpenRouter keys expired.** The ai-proxy success path has never run live
      end-to-end. Renew a key, run a real generation, confirm usage logging + spend cap fire.

## Security

- [ ] **N Phase 4 — Require JWT on ai-proxy.** `verify_jwt=false` predates Supabase Auth
      (shipped 2026-07-03). Require a session JWT / `auth.getUser(token)`; keep `testKey`
      admin-gated. Closes the "publishable key can spend the AI budget" residual.
- [ ] **U (rate limiting) — `/api/public/*` + sitemap are uncapped DB load.** Per-IP/UA token
      bucket in `middleware.ts` + stronger CDN cache headers.

## Engineering infrastructure

- [ ] **W1 — GitHub Actions CI**: `npm ci && lint && typecheck && test` on push/PR (none exists;
      husky is skippable). Pin Node to Vercel's version.
- [ ] **W2 — Make CI a required check** so Dependabot grouped PRs are validated before merge.
- [ ] **W3 — Preview-deploy smoke**: curl `/sitemap.xml`, `/api/public/tree/:id`, `/book/:id`
      on the Vercel preview and assert 200 + markers.
- [ ] **V1 — Top-level React ErrorBoundary** (+ per lazy admin panel); today any render crash
      white-screens the SPA.
- [ ] **V2 — Client error capture** → `client_errors` table via RPC, admin panel rollup
      (reuse the `public_crawl_events` pattern; no new deps).
- [ ] **V3 — Edge/API error surfacing** in admin panels (ai-proxy + `/api/public/*` non-2xx).
- [ ] **X — E2E smoke pack** (5 flows): public-tree browse, sign-in, pedigree + profile open,
      `/book/:id`, `?format=md` + JSON APIs. Playwright or the local agent-browser harness.
- [ ] **Y1 — Split `services/archive.ts`** (4,102 lines) by domain behind a barrel export;
      move pure mappers to `lib/` with tests.
- [ ] **Y2 — Extract App.tsx route/state clusters** into hooks (1,923 lines).

## Bot & LLM agent navigation (traversal audit)

- [ ] **U16 — URL scheme v2** (slugs, `/trees` directory, paginated people + surname indexes,
      family pages, `.md`/`.json` extensions). **Do first** — subsumes the routing halves of
      U11/U12/U13, and redirect debt is near zero only while the day-old UUID URLs are unindexed.
      Full design: roadmap §U16 + crawler-agent-discoverability.md.
- [ ] **U11 — Root `/` is a dead end for bots.** Bot branch for `/` rendering a public-tree
      directory shell; `/api/public/trees` JSON/md endpoint; `<link rel="alternate">` +
      `<noscript>` fallback links in `index.html`.
- [ ] **U12 — Tree index pagination.** Hard 500-person cap drops ~76% of the 2,148-person tree
      from the link graph; the RPC already supports `row_offset`, nothing passes it. Add
      `?page=N` + `rel=next/prev` + visible pagination anchors.
- [ ] **U13 — Family/union surface.** Group children by co-parent, add marriage date/place to
      spouse lines (union data landed 2026-07-04); family pages ride U16 routes.
- [ ] **U14 — Broaden crawler UA gate.** Missing `Claude-Web`/`Claude-User`/`Claude-SearchBot`,
      `Perplexity-User`, `Meta-ExternalAgent`, `Google-Extended`/`GoogleOther`, `MistralAI-User`;
      also honor `Accept: text/markdown` on `/tree/*` regardless of UA.
- [ ] **U15 — Format parity + shell completeness.** Tree `?format=md`; sources/citations list on
      person shells; dynamic `llms.txt` with concrete public-tree entry URLs.
- [ ] **U17b — Typed JSON-LD kinship.** Emit Schema.org `parent`/`children`/`spouse`/`sibling`
      (+ `givenName`/`familyName`/`gender`) instead of lumping into `relatedTo`.
- [ ] **U17c — Lifespans on relation anchors.** "Jens Jensen (1832–1901)" in HTML/md/JSON links —
      dates are already in the payload, just dropped by the bucketing type. *(Bundled into the
      U17a task chip.)*

## Pre-existing open items surfaced during review (already tracked in roadmap)

- [ ] Book HTML prerender for crawlers (U); sitemap-index chunking (U3); `noai` media meta;
      in-app link hygiene audit (U9); traffic rollup + retention (U10a).
- [ ] Backfill `wiki/log.md` for the 2026-06-22→07 auth work (A).
- [ ] OAuth providers + ownership transfer (A).
