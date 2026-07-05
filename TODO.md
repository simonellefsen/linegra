# TODO — open tasks from the 2026-07-04/05 project review

Findings from the engineering review (2026-07-04) and the bot/LLM traversal audit (2026-07-05).
Details live in [wiki/roadmap.md](wiki/roadmap.md) (letters below) and
[wiki/sources/crawler-agent-discoverability.md](wiki/sources/crawler-agent-discoverability.md).
Check items off here; when a slice ships, also update the roadmap entry and add a
[wiki/log.md](wiki/log.md) entry (newest at top).

## Bugs (fix first)

- [x] **U17a — Wrong kinship labels on public person pages.** Children/siblings are labeled with
      the *parent's* role ("Anne King (Father)" under Children; `- Father: [Anne King]` in
      Markdown; contradictory `rel`/`relationshipLabel` in JSON). Fix labels in
      `lib/publicCrawlRelations.ts` + assert labels in the test. *(Background-task chip spawned
      2026-07-05.)*
- [x] **V4 — OpenRouter live path.** Test Connection logs `purpose: test` via ai-proxy;
      Admin **AI Usage** auto-refreshes after test + manual Refresh; see `docs/AI_SETUP.md`
      for the full verification checklist (one in-app generation still worth a manual spot-check).

## DNA analysis (roadmap K9 — new feature)

- [x] **K9 — Candidate-branch hypothesis for unplaced matches.** Join cM→generation-band
      prediction + cluster exclusion + per-line DNA coverage gaps into a ranked "this match most
      likely connects via ancestor couple X" suggestion with research to-dos. Pedigree UI: amber
      coverage-gap halo (inverse of the DNA badges) + hypothesis mode highlighting candidate
      branches. `lib/dnaUncoveredBranches.ts`, `uncovered_branch` in `dnaMatchPlacement.ts`.

## DNA panel (screenshot review 2026-07-05 — roadmap K8)

- [x] **K8a — BUG: "Name match (700%)".** Ranking score (1000/700/40–135) rendered as a percent;
      the ≥60 gate in `dnaMatchPlacement.ts` also assumes 0–100. Normalize to 0–100 or use
      High/Medium/Low labels.
- [x] **K8b — BUG: false "link to" suggestions.** Empty maiden name degenerates the match variant
      to bare first name + raw `includes()` substring → "michael" ⊂ "Michaelsen" etc. Skip empty
      maiden variants; require token-boundary containment. *(Chip spawned with K8a.)*
- [x] **K8c — Investigate: linked counterparts (Jon Arndal Reiersen, Lis Stær) also listed as
      Unknown Matches;** Jon's unknown card lacks the expected "Link to" button despite an
      exact-name person in tree. Dedupe unknowns against linked matches; stop hiding in-tree
      counterparts before link UI.
- [x] **K8d — K3 card UX:** de-duplicate "Top suggestion" vs list; fallback as button-only; add
      Dismiss/"not in my tree"; consider batch actions.
- [x] **K8e — Lineage cards:** dedupe the double path pill; generation-breadcrumb formatting with
      bolded MRCA; "View in tree" action (`lib/dnaLineagePathLabel.ts`, `DnaLineagePathBreadcrumb`).
- [x] **K8f — Clusters/painter/badges:** MRCA-named clusters; name the unclustered matches;
      painter hover tooltips; tree-badge legend + click-through to DNA panel.

## Security

- [x] **N Phase 4 — Require JWT on ai-proxy.** `verify_jwt=true`; client sends session JWT;
      `testKey` superadmin-gated inside the function.
- [x] **U (rate limiting) — `/api/public/*` + sitemap are uncapped DB load.** Per-IP/UA token
      bucket in `middleware.ts`.

## Engineering infrastructure

- [x] **W1 — GitHub Actions CI**: `npm ci && lint && typecheck && test` on push/PR (none exists;
      husky is skippable). Pin Node to Vercel's version.
- [x] **W2 — Make CI a required check** so Dependabot grouped PRs are validated before merge.
      *(GitHub ruleset on `main` requiring `build` — see `docs/CICD.md`.)*
- [x] **W3 — Preview-deploy smoke**: `npm run smoke:public [baseUrl]` curls sitemap, llms.txt,
      tree directory JSON, tree HTML/md shells, and pagination markers.
- [x] **V1 — Top-level React ErrorBoundary** (+ per lazy admin panel); today any render crash
      white-screens the SPA.
- [x] **V2 — Client error capture** → `client_errors` table via RPC, admin panel rollup
      (reuse the `public_crawl_events` pattern; no new deps).
- [x] **V3 — Edge/API error surfacing** in admin panels (ai-proxy + `/api/public/*` non-2xx).
- [x] **X — E2E smoke pack** (5 flows): Playwright `e2e/local.spec.ts` (app shell, login modal,
      book viewer) + `e2e/deployed.spec.ts` (public APIs, tree shells, optional auth/profile via
      `E2E_TEST_EMAIL` / `E2E_PROFILE_PATH`). Run: `npm run test:e2e`.
- [x] **Y1 — Split `services/archive.ts`** by domain behind a barrel export; move pure mappers to
      `lib/` with tests. *(2026-07-05: full split — `services/archive/` modules + 12-line barrel;
      `lib/archiveDbMappers.ts`.)*
- [ ] **Y2 — Extract App.tsx route/state clusters** into hooks (1,923 lines).

## Bot & LLM agent navigation (traversal audit)

- [x] **U16 — URL scheme v2** (slugs, `/trees` directory, paginated people + surname indexes,
      family pages, `.md`/`.json` extensions). **Do first** — subsumes the routing halves of
      U11/U12/U13, and redirect debt is near zero only while the day-old UUID URLs are unindexed.
      Full design: roadmap §U16 + crawler-agent-discoverability.md.
- [x] **U11 — Root `/` is a dead end for bots.** Bot branch for `/` rendering a public-tree
      directory shell; `/api/public/trees` JSON/md endpoint; `<link rel="alternate">` +
      `<noscript>` fallback links in `index.html`.
- [x] **U12 — Tree index pagination.** Hard 500-person cap drops ~76% of the 2,148-person tree
      from the link graph; the RPC already supports `row_offset`, nothing passes it. Add
      `?page=N` + `rel=next/prev` + visible pagination anchors.
- [x] **U13 — Family/union surface.** Group children by co-parent, add marriage date/place to
      spouse lines (union data landed 2026-07-04); family pages at `/tree/{slug}/family/{id8}` +
      `/api/public/family/{unionId}` with HTML/md/JSON-LD shells.
- [x] **U14 — Broaden crawler UA gate.** Added `Claude-Web`, `Perplexity-User`, `Meta-ExternalAgent`;
      `Accept: text/markdown` honored on public routes.
- [x] **U15 — Format parity + shell completeness.** Tree `?format=md`; dynamic `llms.txt` API route;
      sources/citations on person HTML/md/JSON-LD shells.
- [x] **U17b — Typed JSON-LD kinship.** Emit Schema.org `parent`/`children`/`spouse`/`sibling`
      instead of lumping into `relatedTo`.
- [x] **U17c — Lifespans on relation anchors.** "Jens Jensen (1832–1901)" in HTML/md/JSON links —
      `displayNameWithLifespan` in `publicCrawlRelations.ts`; gender threaded from RPC in
      `publicCrawlService.ts`; shell tests in `lib/publicCrawlShells.test.ts`.

## Pre-existing open items surfaced during review (already tracked in roadmap)

- [x] **Book HTML prerender for crawlers** — `/api/public/book/*` HTML/md/JSON shells + middleware rewrite on `/book/*`.
- [x] **U10a — Traffic rollup & retention** — `public_crawl_traffic_rollups` + `rollup_public_crawl_traffic`; admin stats blend rollups with 14-day raw tail.
- [x] **Sitemap-index chunking (U3)** — per-tree person sitemaps + core chunk when URL budget exceeded.
- [x] **`noai` media meta** on public crawl HTML shells + SPA `index.html`.
- [x] **U9 — Link hygiene** — `aria-label`/`title` on all crawl-shell relation and directory anchors.
- [ ] Backfill `wiki/log.md` for the 2026-06-22→07 auth work (A).
- [ ] OAuth providers + ownership transfer (A).
