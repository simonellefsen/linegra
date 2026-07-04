# Roadmap & Open Items

Candidate next work, derived from gaps between [../SPEC.md](../SPEC.md) / [../README.md](../README.md)
and the current code. **These are proposals to prioritize, not commitments.** When a item is
picked up, move it to [log.md](log.md) on completion.

## Status snapshot

Core archive, pedigree UI, GEDCOM import/export, DNA shared-match lineage, OpenRouter AI utilities,
**AI family books + editable per-person biographies**, reusable tree-wide sources/citations, and a
**server-side OpenRouter proxy (key never reaches the browser) + per-call usage metering** are live
and working. The app is **multi-user via Supabase Auth** (roadmap A, 2026-07-03). Automated gates: **eslint + `tsc --noEmit` + Vitest (255 tests)**, wired into `npm run build` and
into husky hooks (`pre-commit`: lint+typecheck; `pre-push`: full build gate). Last reconciled with
git/code 2026-07-02.

## Candidate next work

### A. Multi-user collaboration — IN PROGRESS 2026-07-03
**Shipped in this slice:**
- Supabase Auth (email/password sign-in + sign-up) replaces the local `localStorage` super-admin bootstrap (`services/auth.ts`, `AuthModal.tsx`).
- `can_write_tree` restored to real auth semantics (no more anonymous writes on public trees).
- Mutating `admin_*` RPCs require the `authenticated` role; tree create/delete/settings/relationship/person-profile paths assert `can_write_tree`.
- Collaborator RPCs + **Administrator → Trees → Collaborators** panel (invite editor by email, revoke, re-activate).
- First registered profile becomes `superadmin`; legacy ownerless trees can be **claimed** by a superadmin.
- Tree list returns `my_role` per tree; UI gates edit/admin affordances on owner/editor (or superadmin on ownerless trees).

**Still open:**
- OAuth providers (Google/GitHub) — email-only for now.
- Ownership transfer between accounts.
- Backfill `log.md` for 2026-06-22→07 auth work.

**Shipped 2026-07-04 (invites inbox):**
- `list_my_pending_collaborator_invites()` RPC + **Researcher Profile → Tree invitations** panel.
- Home banner when pending invites remain (e.g. email mismatch); auto-accept still runs on sign-in/session restore.

### B. Retire / consolidate the legacy force graph — DONE 2026-06-26
Deleted [../components/FamilyTree.tsx](../components/FamilyTree.tsx). It could never render:
`layoutType` was `useState<TreeLayoutType>('pedigree')` with **no setter**, so the
`layoutType === 'pedigree' ? <PedigreeTree/> : <FamilyTree/>` ternary always took the pedigree branch
— the force-graph else-branch was dead code. Removed the component, its App import, the dead branch,
and the now-unused `layoutType` state + `TreeLayoutType` import. Bundle dropped **765→703 KB** (d3-force
gone). Its one useful trait — `RelationshipConfidence` edge encoding — was already ported into the live
pedigree view (L1, 2026-06-26). The layout-persistence/audit subsystem (`persistFamilyLayout` /
`fetchFamilyLayoutAudits` → admin Database panel; `onPersistFamilyLayout` → PersonProfile) is **separate
and retained**. Decision updated: [decisions/pedigree-over-force-graph.md](decisions/pedigree-over-force-graph.md).

### C. Test coverage — DONE 2026-06-20
Vitest added; **54 tests** cover DNA CSV parsing (`lib/dnaRawParser.ts`), cM-classification
(`lib/dnaClassification.ts`), place parsing, the AI cache, and **GEDCOM parse + serialize +
round-trip** (`lib/gedcomParser.ts`, both `parseGedcom` and `serializeGedcom` extracted from
`ImportExport.tsx`). `npm test` is **wired into the build gate** (`npm run build`), so failing
tests block the Vercel deploy.
**Remaining:** broaden coverage into `services/archive.ts` mapping helpers (`mapDbRelationship`,
person/place mappers); consider component/UI tests (would need jsdom).

### D. DNA UX polish — DONE 2026-06-20
- ✅ Profile DNA tab ([../components/person-profile/DNATab.tsx](../components/person-profile/DNATab.tsx))
  now shows the **same resolved-lineage verdict** as the admin panel — path found + **cM
  compatibility** (compatible / "review cM mismatch" / no path) + cM prediction — via the shared,
  tested `describeSharedLineage` helper in [../lib/dnaClassification.ts](../lib/dnaClassification.ts)
  (mirrors the resolver's `pathFitsPrediction`/`predictionLabel`). Previously it showed only a
  relationship-link count. SPEC §6.3 parity achieved.
- Follow-ups: the full human-readable `pathLabel` (names) still shows only in the admin panel —
  surfacing it in the profile would need name plumbing or persisting the label. Also confirm a
  *mismatched* path persists `sharedPathRelationshipIds` so the badge survives reload for that case.
- shared-cM ranges doc maintained: [sources/dna-cm-ranges.md](sources/dna-cm-ranges.md) cross-links
  the `supportsRelationshipHops` thresholds that drive the verdict.

### E. GEDCOM fidelity — DONE 2026-07-04
- Audit unsupported-tag warning coverage; ensure source+citation context is preserved on import
  (SPEC §5). Consider round-trip tests (import → export → diff).
- After import, set a sensible `defaultProbandId` on the new tree so the interactive tree opens on
  a chosen root rather than the arbitrary `treePeople[0]` (see 2026-06-20 tree-switch fix in log).

> **Done 2026-07-04:** [../lib/gedcomFidelity.ts](../lib/gedcomFidelity.ts) adds
> `inferDefaultProbandId` (parentless + descendant-heavy anchor), `summarizeGedcomArchive`, and
> `diffGedcomArchiveSummaries` for import→export regression tests (+4 tests in
> [../lib/gedcomFidelity.test.ts](../lib/gedcomFidelity.test.ts)). `importGedcomToSupabase` now
> persists `defaultProbandId` via `updateTreeSettings` and returns the mapped UUID; post-import UI
> refreshes the active tree and focuses the pedigree on that person ([../App.tsx](../App.tsx)).
> Parser warnings extended for unsupported REPO/OBJE tags; citation PAGE/QUAY/DATA round-trip covered
> by tests. See [integrations/gedcom.md](integrations/gedcom.md).

### H. GEDCOM 7.0 alignment — full gap analysis in [sources/gedcom7-alignment.md](sources/gedcom7-alignment.md)
Structure the schema + code around FamilySearch GEDCOM 7.0 while still importing 5.x. Phased:
- **P0 — DONE 2026-06-20:** `lib/gedcomTokenizer.ts` (`CONC`/`CONT` merge — recovers dropped
  notes, BOM strip, `@@` un-escape, `HEAD.GEDC.VERS` detect, `@VOID@`); `RESN` privacy on import.
- **Export — DONE 2026-06-20:** `serializeGedcom` now emits **GEDCOM 7.0 only** (BOM, `VERS 7.0`,
  `SCHMA` for `_LIVING`, valid xrefs + `UID`, structured names, `SEX` M/F/X/U, `RESN`, upper-cased
  dates, `CONT`). Verified on the real 2148-person tree.
- **P1 (schema spine):** structured dates (calendars/ranges/approx/BCE/PHRASE — lossless), `NAME`
  parts + `TYPE` + `TRAN`, `SEX` → M/F/X/U, full event detail (`TYPE`/`AGE`/`CAUS`/`AGNC`/value`),
  `QUAY` 0–3, and `UID`/`EXID`/`REFN` (also fixes export round-trip ids).
  > **Done 2026-06-27 — P1 structured dates (the date spine):** [../lib/gedcomDate.ts](../lib/gedcomDate.ts)
  > parses GEDCOM 5.5.1/7 dates losslessly into a `StructuredDate` (`raw` verbatim + calendar +
  > qualifier + range bounds + BCE + phrase; `representativeYear`/`formatStructuredDate`). Adopted in
  > `extractBirthYear` (range → start year, behavior-preserving) so lifespan/data-quality/books all
  > gain structured interpretation with zero test regressions (19 parser tests).
  > **Done 2026-06-29 — P1 UID/EXID/REFN:** [../lib/gedcomParser.ts](../lib/gedcomParser.ts) now
  > captures `UID`, `EXID` (+`EXID.TYPE`), and `REFN` (+`TYPE`) from INDI records into
  > `person.metadata` (jsonb — no migration) and re-emits them on export; the original source `UID`
  > is preserved verbatim instead of being overwritten with the internal id, so import→export keeps
  > identity (5 round-trip tests).
  > **Done 2026-06-29 — P1 QUAY:** source-citation certainty (0–3) is now typed (`Quay` on `Citation`,
  > [../lib/sourceQuality.ts](../lib/sourceQuality.ts) `parseQuay`/labels, 5 tests) and **surfaced as a
  > Certainty selector in the Sources tab** ([../components/person-profile/SourcesTab.tsx](../components/person-profile/SourcesTab.tsx)).
  > The data already round-tripped via the `quality` column + the exporter's `1 QUAY`; this adds the
  > typed field, validates 0–3, and lets a curator set it per citation.
  > **Done 2026-06-29 — P1 NAME TYPE:** [../lib/nameTypes.ts](../lib/nameTypes.ts) maps GEDCOM 7
  > `NAME.TYPE` ↔ `AlternateNameType` (aka/birth/maiden/married/immigrant/name-changed/nickname/…).
  > Import now captures `2 TYPE` under a NAME (was hard-coded "Also Known As") and `2 NICK` (nickname),
  > and export emits **every** alternate name as `NAME` + `2 TYPE` (previously only the maiden was
  > emitted — alternates were dropped on export). Round-trip tests.
  > **Done 2026-06-29 — P1 TRAN:** `NAME.TRAN` (name transliteration, e.g. Cyrillic→Latin) is captured
  > as an `Anglicized Name` alternate and round-trips via `2 TYPE immigrant`. **P1 name structure is
  > complete** (NAME parts + TYPE + TRAN).
  > **Done 2026-06-30 — P1 event detail:** `AGE` / `CAUS` / `AGNC` are captured — `DEAT.CAUS` routes to
  > `person.deathCause` (re-emitted as `2 CAUS` on export); AGE lands on the event's `metadata` (custom
  > events) or `person.metadata.{birt|deat|buri}Age` (vitals); `AGNC` on event metadata. 5 tests.
  > **All no-migration P1 fields are done.**
  > **Done 2026-06-30 — P1 structured-date persistence (P1 complete):** the parsed `StructuredDate` for
  > each vital is now persisted into `person.metadata` jsonb (`birthDateStructured`/`deathDateStructured`/
  > `burialDateStructured`) at import — **no migration** (the roadmap had flagged this as needing one; the
  > jsonb approach makes it unnecessary, same as UID/EXID/REFN). And the exporter now emits the **GEDCOM 7
  > calendar keyword** for non-Gregorian dates (`JULIAN 3 MAR 1712`), so a Julian/French/Hebrew date
  > round-trips with its calendar intact instead of being silently re-inferred as Gregorian. 4 tests.
  > **P1 is complete.**
- **P2:** new records — `REPO`, `SNOTE`, `OBJE`/MIME multi-file, `ASSO` associations.
  > **Done 2026-06-30 — P2 SNOTE (import):** shared-note records (`0 @N1@ SNOTE` / `0 @N1@ NOTE`) are
  > captured, and `1 NOTE @N1@` pointer references resolve to their text — including forward references
  > (resolved after the parse pass) and multi-line text (CONT merged by the tokenizer). Previously these
  > references were stored as literal `@N1@`, losing the note. Export still emits notes inline (valid
  > GEDCOM; dedup back into shared SNOTE records is a follow-up). 5 tests.
  > **Done 2026-06-30 — P2 ASSO:** associations to other people (`1 ASSO @I2@` + `2 RELA godparent`,
  > e.g. witnesses/godparents) are captured into `person.metadata.associations` (no Relationship-type
  > or DB-enum change — ancillary to the person) and re-emitted on export (skipping any target not in
  > the export set so there are no dangling refs). 4 tests incl. round-trip.
  > **Done 2026-06-30 — P2 REPO:** repository records (`0 @R1@ REPO` + `1 NAME`) are parsed, and a
  > source's `1 REPO @R1@` pointer resolves to the repository name (deferred, so forward refs work;
  > AUTH takes precedence). Resolved repositories are re-flowed into the person-level source copies,
  > which now also carry `callNumber`/`abbreviation`. 3 tests.
  > **Done 2026-06-30 — P2 OBJE:** multimedia objects — both inline `1 OBJE` (+ `2 FILE`/`2 FORM`/
  > `2 TITL`) and `0 @M1@ OBJE` records referenced by `1 OBJE @M1@` (forward refs resolved after the
  > pass) — are captured losslessly into `person.metadata.media`. The binary itself is **not** fetched
  > (`FILE` usually points at a local path the browser can't read); only the reference/MIME/title
  > round-trip. (Also gated the person `1 TITL` handler to level 1 so `2 TITL` under OBJE is no longer
  > swallowed.) 4 tests. **P2 is complete — and with it, all of GEDCOM 7 (roadmap H): P0, Export, P1,
  > P2, P3.**
- **P3:** compliant GEDCOM 7.0 exporter + `SCHMA` extension declarations + round-trip tests.
  > **Done 2026-06-30 — P3 (exporter gap + round-trip harness):** non-vital events (OCCU/RESI/EVEN/…)
  > are now exported (`emitCustomEvent` emits DATE/PLAC + the AGE/CAUS/AGNC from event metadata) — they
  > were **dropped entirely** before, so event data couldn't round-trip. Plus a comprehensive lossless
  > round-trip test asserting a richly-populated person (dates + calendar, UID/EXID/REFN, alternate
  > names, deathCause, structured dates, events) survives export → import. `SCHMA` (for `_LIVING`) was
  > already emitted in the Export phase. **P3's exporter + round-trip goals are met;** P2 (new record
  > types) remains.
- Cross-cutting: keep raw GEDCOM payload for lossless round-trip; capture `gedcom_version` per import.

### F. AI utilities — DONE 2026-06-20
- ✅ Deterministic fallback for place parsing (`lib/placeParser.ts`); `parsePlaceString` now
  backfills/merges instead of returning bare `{ fullText }`.
- ✅ In-memory bounded caching (`lib/aiCache.ts`) for `parsePlaceString` + `normalizeDeathCause`.
- Possible follow-ups: persist the cache to `localStorage` across sessions; add deterministic
  fallbacks for `generateBio` / `analyzeHistoricalEra` (currently still key-dependent).

### G. Performance guardrails — DONE 2026-07-04
SPEC §7 demands no full-tree hydration for default views. The interactive tree already uses
`load_pedigree_scope` (scoped RPC) via `loadPedigreeScope` in [../services/archive.ts](../services/archive.ts);
App state holds only the current scope, not the full archive.

> **Done 2026-07-04:** [../lib/treePerformance.ts](../lib/treePerformance.ts) centralizes depth caps,
> default/expanded view budgets (people + relationships), search/landing scan limits, and
> `evaluatePedigreeScopeBudget` / `measurePedigreeScopeCompute` helpers. [../lib/treePerformance.test.ts](../lib/treePerformance.test.ts)
> benchmarks `computePedigreeScope` on synthetic binary trees and on local `.ged` fixtures when present
> (Big-Andersen, etc. — same gitignored pattern as `gedcomParser.test.ts`). Dev-only console warning when
> `loadArchiveData` exceeds 500 people (admin book/research panels). Constants wired through `App.tsx` and
> `loadPedigreeScope` defaults.
>
> **Build performance (2026-07-04):** removed unused `d3` / `@google/genai` deps and the stale
> `index.html` importmap (Vite bundles everything). Vite `manualChunks` splits react / supabase /
> lucide; Administrator panels are `React.lazy` code-split. Vitest runs with `pool: 'threads'`.
> **Dependency security (2026-07-04):** weekly `npm audit` hygiene; Dependabot grouped PRs;
> [runbooks/dependency-security.md](runbooks/dependency-security.md). Runtime priority:
> `@supabase/supabase-js` 2.x; defer ESLint 10 / Vite 8 / TypeScript 6 until dedicated migrations.

### I. Historical calendar & date conversion (hard; design carefully) — see [sources/historical-dates.md](sources/historical-dates.md)
Julian ↔ Gregorian is **not** a single global toggle — Gregorian adoption ranged from 1582
(Catholic Europe) to 1752 (Britain/colonies), **1753 (Sweden/Finland)**, 1918 (Russia)… so
conversion must be keyed off **place + date** and is often ambiguous.
- **Foundation (part of P1 dates):** persist the raw date text + GEDCOM 7 calendar tag
  (`GREGORIAN`/`JULIAN`/`FRENCH_R`/`HEBREW`) + `PHRASE`; **never silently coerce to Gregorian**.
  Must represent Julian, BCE, ranges/approximations, and oddities like **30 FEB 1712** (the real
  Swedish-calendar date — Sweden's 1700–1712 anomaly + 1753 switch).
- **Conversion:** opt-in, place/era-aware, with assumptions surfaced — not a global setting.
- **Advanced (optional, later):** resolve church-record date forms — movable feasts
  (Fastlagssöndagen, Pingstdagen…), name-days (Hindersmässan = St Henrik = 19 Jan), and Latin
  medieval dating — to civil dates (essentially the *Almanacka för 500 år* algorithm). Until then,
  preserve the original phrase verbatim. Relevant to the Danish/Swedish `.ged` files we import.

### J. AI Family Books — DONE 2026-06-20
The fourth pillar of the product goal (AI-written family-history books + PDF export) is live.
See the [log entry](log.md) and [concepts/ai-family-books.md](concepts/ai-family-books.md).
- ✅ Pure planning (`lib/bookComposer.ts`, 15 tests), AI composers with deterministic fallbacks
  (`services/ai.ts`), orchestration + Supabase persistence (`services/books.ts`), `family_books`
  migration (applied), Administrator → **Books** tab, print-to-PDF overlay (`components/book/*`),
  scoped `@media print` in `index.css`. Zero new deps.
- **Follow-ups (open):** in-UI chapter editor (structured `chapters` jsonb is ready for it);
  public sharing (`is_public` + viewer route); per-person detail enrichment (`fetchPersonDetails`)
  for deeper bios; revive the profile StoryTab "AI Rewrite" button (bio isn't editable in
  `PersonProfile` today). Note: the Books panel needs the tree archive loaded first (same as the
  GEDCOM panel) — consider loading `allPeople` on tree selection so admin panels work without first
  visiting Interactive Tree.

### K. DNA analysis & visualization
Extends SPEC §6.1 (ingestion) / §6.3 (lineage resolution); new SPEC ground — flag a §6 update. Turn
DNA from a per-match verdict into a tree-wide analytical surface. The cM classifier, shared-segment
parser, and lineage resolver already exist — the gap is higher-order analysis and the consent work
that gates raw data.

> **Done 2026-06-22 — K1 (engine):** [../lib/dnaClustering.ts](../lib/dnaClustering.ts) groups
> shared-segment matches into triangulation clusters via union-find (min-cM filter, 11 tests).
> **Done 2026-07-03 — K1 (admin UI):** [../components/AdminDnaPanel.tsx](../components/AdminDnaPanel.tsx)
> surfaces overlap clusters for the selected autosomal tester (min-cM filter, segment-row data from
> shared-segment CSV imports). ICW / parental-side confirmation still future work (caveat below).

- **K1. Segment triangulation / Leeds-method clustering — UI slice DONE 2026-07-03.** Admin DNA panel
  shows overlap clusters. Remaining: four-grandparent Leeds labeling, ICW confirmation, parental-side
  filtering. Reuse the per-segment data already parsed in
  [../lib/dnaRawParser.ts](../lib/dnaRawParser.ts) (`parseSharedSegmentsCsv`,
  `parseFtdnaSharedSegmentsCsv`), the cluster labels in
  [../lib/dnaClassification.ts](../lib/dnaClassification.ts), and the `dna_matches` schema. Deeper
  design: `sources/dna-triangulation.md` (to be written).
- **K2. MRCA suggestion from shared matches + cM — DONE 2026-07-04.** Ranks MRCA candidates by
  supporting matches, combined cM, cluster overlap, and path convergence in
  [../lib/dnaMrcaSuggestions.ts](../lib/dnaMrcaSuggestions.ts), surfaced in the admin DNA panel.
- **K3. In-tree auto-placement of unknown matches — DONE 2026-07-04.** Unlinked shared-segment
  imports surface in the admin DNA panel with placement suggestions
  ([../lib/dnaMatchPlacement.ts](../lib/dnaMatchPlacement.ts)); curators can link to an existing
  person or create a `is_dna_match` placeholder and attach the test.
- **K4. Y / mtDNA haplogroup fields + migration routes — DONE 2026-07-04.** Profile DNA tab stores
  **Y-DNA**, **mtDNA**, and **Mitotree**; migration route cards use
  [../lib/haplogroupRoutes.ts](../lib/haplogroupRoutes.ts) (curated reference dataset).
- **K5. DNA-painter-style segment view — DONE 2026-07-04.** Per-chromosome segment bars colored by
  cluster in [../components/dna/DnaSegmentPainterView.tsx](../components/dna/DnaSegmentPainterView.tsx),
  wired into the admin DNA panel. Pure layout in [../lib/dnaSegmentPainter.ts](../lib/dnaSegmentPainter.ts).
- **K6. Raw-autosomal ingestion beyond CSV — DONE 2026-07-04.** Full SNP index builder +
  kit-vs-kit comparison in [../lib/dnaAutosomalIndex.ts](../lib/dnaAutosomalIndex.ts); admin panel
  compares encrypted indices when consent + key are present.
- **K7. Consent + encryption-at-rest for raw biometric DNA — DONE 2026-07-04.** Consent modal on
  raw import, `consent_given_at` / `consent_scope` columns, AES-GCM encrypted payload storage
  ([../lib/dnaRawEncryption.ts](../lib/dnaRawEncryption.ts)), purge RPC, private test flagging.
  Policy: [decisions/raw-dna-consent-and-encryption.md](decisions/raw-dna-consent-and-encryption.md).
- **Sequencing:** K7 → K6 → K1 → K5 — **complete.**

### L. Interactive tree enhancements
Extends SPEC §7 (performance); new UI views are new SPEC ground. The pedigree view
([../components/InteractiveTree/PedigreeTree.tsx](../components/InteractiveTree/PedigreeTree.tsx)) is
solid but single-mode. These add alternate lenses (DNA-aware, spatial, chronological) without
replacing the layout engine in [../lib/pedigreeLayout.ts](../lib/pedigreeLayout.ts).

> **Done 2026-06-22 — L1 (DNA edges); 2026-06-26 — confidence edges; 2026-06-27 — shared-cM (L1
> complete):** DNA-backed pedigree edges trace emerald; non-DNA edges encode `RelationshipConfidence`
> (Confirmed bold indigo → Speculative faint dashed; unset keeps the default lineage indigo); and each
> DNA badge now shows the **strongest backing shared-cM** beneath the match count, with the cM repeated
> in the edge hover tooltip — all in
> [../components/InteractiveTree/PedigreeTree.tsx](../components/InteractiveTree/PedigreeTree.tsx). The
> cM join: App collects the match ids stamped on `relationships.metadata.dna_support_by_person`
> ([../lib/dnaSupport.ts](../lib/dnaSupport.ts)) and fetches `dna_matches.shared_cm` by id
> ([../services/archive.ts](../services/archive.ts) `fetchDnaMatchCm`) — `dna_matches` has no `tree_id`
> (RLS scopes via `persons`), so it's fetched by id set, not per tree. **L1 is complete.**

- **L1. DNA-aware tree overlay — DONE 2026-06-27 (complete).** Edges encode `RelationshipConfidence`
  (color/style) and DNA-backed edges surface **shared-cM** on the badge + hover tooltip, joined from
  `dna_matches.shared_cm` by the match ids in `dna_support_by_person`. Reused the existing confidence
  enum + `relationships.metadata.dna_support_by_person`. Extends D.
- **L2. Fan / pedigree-compact view — DONE 2026-07-04.** Alternate ancestor fan renderer for 8+
  generations: [../lib/fanLayout.ts](../lib/fanLayout.ts) maps pedigree spans to polar coordinates;
  [../components/InteractiveTree/FanTree.tsx](../components/InteractiveTree/FanTree.tsx) with DNA-aware
  edges; **Pedigree / Fan** toggle on the Interactive Tree tab. Descendants stay in the standard pedigree
  view — fan is ancestors-only.
- **L3. Timeline / chronological view — DONE 2026-07-04.** Birth/death/burial + custom events on a
  time axis for the scoped pedigree ([../components/InteractiveTree/TimelineView.tsx](../components/InteractiveTree/TimelineView.tsx),
  [../lib/timelineEvents.ts](../lib/timelineEvents.ts)).
- **L4. Map / migration view — DONE 2026-07-04.** SVG equirectangular map with lat/lng or country-centroid
  fallback, animated birth→death segments ([../components/InteractiveTree/MapView.tsx](../components/InteractiveTree/MapView.tsx),
  [../lib/placeCoordinates.ts](../lib/placeCoordinates.ts)). No external map-tile dependency.
- **L5. Keyboard navigation + search-to-focus + breadcrumbs — DONE 2026-07-04.** Ancestor breadcrumbs,
  ↑↓←→ pedigree navigation, Home reset, `/` focuses search ([../lib/treeNavigation.ts](../lib/treeNavigation.ts),
  [../components/InteractiveTree/useTreeKeyboardNav.ts](../components/InteractiveTree/useTreeKeyboardNav.ts),
  [../components/InteractiveTree/TreeViewToolbar.tsx](../components/InteractiveTree/TreeViewToolbar.tsx)).
- **L6. Tree export as PNG / SVG / PDF — DONE 2026-07-04.** Client-side SVG/PNG export + print/PDF via
  [../lib/treeExport.ts](../lib/treeExport.ts) (Export menu on tree toolbar).
- **L7. Side-by-side person / tree compare — DONE 2026-07-04.** Dual pedigree scopes with person pickers
  ([../components/InteractiveTree/CompareTreeView.tsx](../components/InteractiveTree/CompareTreeView.tsx)).
- Virtualization for large trees folds under **G** (performance guardrails) / SPEC §7**, not a new L item.
- **L track complete (L1–L7).** **N Phase 3** (AI spend cap) is done. Next themed groups: **A** (multi-user auth polish) or remaining **M** items.

### M. AI family books & biography editing
Builds on J. Extends SPEC §3.5 (admin workspace) and adds a public viewer; grounding policy ties to
§8. The books pillar works end-to-end (compose → persist → print-to-PDF) and per-person biographies
persist with signatures + staleness detection — **but both are effectively read-only after
generation.** Books are write-once (no chapter editing, reorder, or single-chapter regen);
biographies are AI-generate-only in the StoryTab (no manual text editing). The schemas are already
structured for editing, so M makes human editing first-class and deepens generation quality. Policy
foundation: [decisions/ai-narrative-editing-and-grounding.md](decisions/ai-narrative-editing-and-grounding.md).

> **Done 2026-06-22 — editing + grounding arc; 2026-06-27 — M3:** M6 (manual biography editing), M1
> (in-UI book editor), M2 (single-chapter regen), M7 (richer inputs: life events + sources), M11
> (fact-grounding footers + hedged prose), M10 (AI-assisted text ops), M12 (retire legacy
> `generateBio`), and M3 (richer book structure: `section` divider kind, per-chapter `status`
> draft/edited/locked with a lock toggle, and a section-aware TOC + divider pages). Remaining: M4
> (versioning); M5 (public viewer) is gated by roadmap **A** (multi-user auth).

*Book creation & editing:*

- **M1. In-UI book editor (highest book-leverage).** The `chapters` jsonb is already structured
  (`BookChapter` = kind/title/personId?/narrative/facts?). Add: inline edit of chapter text, reorder
  (drag or up/down), add/remove custom chapters (intro, photo essay, source appendix), edit titles.
  Reuse `BookChapter` + `saveFamilyBook` in [../services/books.ts](../services/books.ts). Deeper
  design: `sources/book-editor.md` (to be written).
- **M2. Single-chapter regeneration.** Today only "force-regenerate all." Add per-chapter
  "regenerate" (and "regenerate with different style/length") via `composePersonBiography` /
  `composeFamilyOverview` in [../services/ai.ts](../services/ai.ts). The composer already works
  chapter-by-chapter — just expose one chapter.
- **M3. Richer book structure — DONE 2026-06-27.** `BookChapterKind` is now `'overview' | 'person' |
  'custom' | 'section'` (the `section` kind is a structural Part divider); each chapter carries an
  optional `status` (`'draft' | 'edited' | 'locked'`) that the editor surfaces as a badge + lock
  toggle (locking freezes the text + Regenerate), and the print/preview TOC groups chapters under
  section headers with divider pages. `status` rides the existing `chapters` jsonb — no migration.
- **M4. Book versioning + draft/publish — DONE 2026-06-30 (client-side slice).** The book editor now
  keeps a **version history**: each Save/Publish records a snapshot of the title/subtitle/chapters
  (deduped + capped at 25), browsable via a History panel with one-click Restore (non-destructive; a
  restore becomes a draft until Saved). A **Publish** action saves with `status: 'complete'`. Logic is
  pure + tested in [../lib/bookVersions.ts](../lib/bookVersions.ts) (8 tests); persistence is
  browser-localStorage ([../lib/bookVersionStore.ts](../lib/bookVersionStore.ts)) — **no migration**, works
  immediately. **Deferred to M5:** server-side snapshots (a `family_book_versions` table +
  `published_chapters` column via migration) for cross-device history and a viewer-facing published
  snapshot the public viewer reads.
- **M5. Public book sharing viewer — DONE 2026-07-04.** Read-only viewer at `/book/:id` (also `?book=:id`)
  via [../components/book/PublicBookViewerPage.tsx](../components/book/PublicBookViewerPage.tsx) +
  [../lib/bookShare.ts](../lib/bookShare.ts). Uses existing `is_public` RLS (`can_read_tree` + published
  `status: complete`). Share toggle + copy link in [../components/book/BookShareControls.tsx](../components/book/BookShareControls.tsx)
  (book editor + saved-books list). Print/PDF via existing `@media print` styles. `vercel.json` SPA rewrite
  for direct `/book/*` links.

*Biography editing & generation:*

- **M6. Manual biography editing in StoryTab (highest bio-leverage).** Today
  [../components/person-profile/StoryTab.tsx](../components/person-profile/StoryTab.tsx) shows
  biography read-only with only AI Generate/Rewrite. Add an editable textarea (admin) that persists
  to `person_biographies.narrative` with `is_manual = true` — **the flag already exists.** AI
  rewrite becomes a starting point, not the only path. Reuse `upsertPersonBiography` in
  [../services/books.ts](../services/books.ts). Deeper design: `sources/biography-editing.md` (to be
  written).
- **M7. Richer biography inputs (`fetchPersonDetails`).** Composition uses only the provided
  `Person` object today (J flags this). Pull deeper context: events, occupations timeline,
  sources/citations, and already-composed relative narratives. Reuse/expand `buildChapterFacts` +
  `BookChapterFacts` in [../lib/bookComposer.ts](../lib/bookComposer.ts).
- **M8. Per-biography style/tone controls + variants.** StoryTab hardcodes
  `{style:'narrative', length:'medium'}` today. Expose style/length/language pickers per person, and
  consider a `variant` dimension (the table is keyed by `(person_id, language)` only; provenance
  cols `style`/`length`/`model` already exist).
- **M9. Streaming generation UX.** All AI calls are request→full-response with a progress bar
  today. Stream biography/chapter text token-by-token via OpenRouter SSE for better perceived
  performance on long bios. Add streaming variants alongside the cached path.
- **M10. AI-assisted editing (selection ops, not full regen).** Once text is editable (M1/M6), add
  operations on a selection: "rewrite this paragraph," "make more formal," "expand with sources,"
  "translate to [lang]."
- **M11. Citation & fact-grounding in generated text.** Generated bios/books can hallucinate, which
  matters in genealogy. Have the composer cite which facts/events/sources each passage draws from,
  and flag ungrounded sentences as narrative interpolation. Reuse the existing sources/citation
  system; policy in the decision doc above. Pairs with M7.
- **M12. Retire legacy `generateBio`.** [../services/ai.ts](../services/ai.ts) `generateBio`
  (~L416–446) is unused (books use `composePersonBiography`). Remove it — housekeeping, like B.
- **Sequencing:** M6 + M1 (editing foundation, parallel) → M2 → M7 → M11 → M10 → M3/M4/M5. M9 runs
  in parallel; M12 anytime.

### N. Server-side AI proxy + key protection + cost guardrails (SECURITY) — Phase 1+2 DONE 2026-07-02
> **Done 2026-07-02 — Phase 1 (key server-side):** all OpenRouter calls now route through a new Supabase
> Edge Function, [../supabase/functions/ai-proxy/index.ts](../supabase/functions/ai-proxy/index.ts) (Deno,
> dependency-free). The two client fetchers in [../services/ai.ts](../services/ai.ts) (`callOpenRouter` /
> `callOpenRouterRaw`, via `postToAiProxy` → `buildAiProxyUrl`) POST to `${SUPABASE_URL}/functions/v1/ai-proxy`
> with the publishable `apikey` — **never** the OpenRouter key. The browser no longer resolves, holds, or
> transmits it (`resolveOpenRouterConfig` now uses the *metadata* RPC; `fetchAdminAIRuntimeSettings` / the
> raw-key `admin_get_ai_runtime_settings` RPC are no longer called from the browser). **Verified live:** the
> Network tab hits only the proxy, with **zero** `openrouter.ai` requests and no key in any payload.
> The function is **DB-backed** — it reads the key from `ai_provider_settings` via the auto-injected
> service-role key (optional `OPENROUTER_API_KEY` secret override), so the admin "enter key / Test Connection"
> UI is unchanged. The key leaves the browser but stays in the DB (plaintext, as before; encrypt-at-rest is a
> later hardening). `verify_jwt=false` (local admin has no JWT — see A); the gateway still requires the
> publishable key; per-tree/day caps (Phase 3) further limit spend. Real auth (roadmap A) remains the
> long-term abuse hardening.
> **Done 2026-07-02 — Phase 2 (usage logging + spend view):** a new `ai_usage_logs` table (migration
> `20260702120000`) + `admin_get_ai_usage_summary(days)` RPC (SECURITY DEFINER); the function logs each call's
> model/tokens/estimated-cost/tree, and a new **AI Usage** section in
> [../components/admin/AdminDatabasePanel.tsx](../components/admin/AdminDatabasePanel.tsx) (via
> `fetchAiUsageSummary` in [../services/archive.ts](../services/archive.ts)) shows rolling 7/30/90-day totals,
> per-purpose and per-tree. AI family-book composition threads `treeId` (`BookGenerationOptions.treeId`) for
> per-tree attribution; other calls are logged by purpose only. 255 tests (+7). Deployed to the linked project.
> **Done 2026-07-04 — Phase 3 (per-tree/day spend cap):** migration `20260704120000` adds
> `check_ai_usage_budget(tree_id)` (UTC calendar-day spend from `ai_usage_logs`, caps in
> `ai_provider_settings.metadata`) and extends `admin_upsert_ai_settings` / `admin_get_ai_settings_metadata`
> with cap fields. The ai-proxy checks budget before relay (returns **429** +
> `{ code: "AI_BUDGET_EXCEEDED" }`; admin **Test Connection** bypasses via `testKey`). Cap controls +
> today's spend live in **Administrator → Database → AI Settings**
> ([../components/admin/AdminDatabasePanel.tsx](../components/admin/AdminDatabasePanel.tsx)).
> Over-budget calls log as errors and the client falls back to deterministic paths
> ([../lib/aiUsageBudget.ts](../lib/aiUsageBudget.ts)).
> **N track complete (Phase 1–3).**

Previously every OpenRouter call ran **client-side** with `Authorization: Bearer ${apiKey}`, so the key
reached the browser and anyone who could read settings or sniff traffic could exfiltrate it and spend
against the account, with no usage metering or rate limit. Pairs with **K7** (raw-DNA never on the public
path) as the security track.

### O. Data-quality / consistency engine ("Research issues") — DONE 2026-06-26
The pure engine + admin panel shipped: [../lib/dataQuality.ts](../lib/dataQuality.ts) runs
death-before-birth / burial-before-death / implausible-lifespan / parent-age / child-after-death /
duplicate-person checks (unit-tested), surfaced read-only in **Administrator → Research**
([../components/admin/AdminResearchPanel.tsx](../components/admin/AdminResearchPanel.tsx)). On the real
2148-person tree it flags ~10 errors. **Remaining:** dismiss / convert-to-`Discrepancy`-note actions,
and the optional "suggest next record to find" AI layer.
A genealogy-native validation pass that surfaces likely errors as actionable items. The schema
already has `note_type = 'Discrepancy'`/`'To-do'` and `lib/lifespan.ts` (130-yr cap) to build on.
- Checks: parent younger than child / child born before parent; death before birth; burial before
  death; child born >~10 mo after father's death or after mother's death; marriage/parenthood under a
  plausible age; impossible lifespans; **duplicate-person detection** (same name + overlapping dates).
- Surface as a tree-level **"Research issues"** panel and per-person badges; let an admin dismiss or
  convert an issue into a `Discrepancy` note. Pure, unit-testable in a `lib/dataQuality.ts`.
- Optional AI layer: suggest the *next record to find* given what vitals/sources are present (pairs
  with P/§ research log).

### P. Relationship calculator + path finder — DONE 2026-06-26
Shipped: [../lib/relationshipCalculator.ts](../lib/relationshipCalculator.ts) finds the MRCA, derives
the label (parent / grandparent / sibling / half-sibling / aunt-uncle / niece-nephew / cousin with
degree + removed) and reconstructs the A→B path (unit-tested). Rendered as a card in **Administrator →
Research** ([../components/admin/RelationshipCalculator.tsx](../components/admin/RelationshipCalculator.tsx))
with two person pickers (self-loads the archive). Feeds L (tree nav) and is reusable for K2 (MRCA).
"How is A related to B?" and "show the path between A and B" across the tree. Reuse the lineage
resolver + [../lib/pedigreeScope.ts](../lib/pedigreeScope.ts); render cousin-degree/removed labels
(the cM-range tables in [sources/dna-cm-ranges.md](sources/dna-cm-ranges.md) already encode the
relationship vocabulary). Feeds L (tree navigation), K2 (MRCA), and the DNA verdicts.

### Q. Media intelligence (faces, tagging, OCR, per-person gallery)
The media store + AI vision are both live (`transcribeRecordImage`, `media_person_links` with
`event_label`). Build on them: tag people in a photo (write `media_person_links`), AI auto-caption,
optional face-grouping, and a **per-person photo timeline/gallery**. Document images can reuse the
transcription pipeline for searchable OCR text. New runtime deps (a face model) must be flagged.

### R. Patronymic & Nordic naming intelligence (folds toward I)
Danish/Swedish/Norwegian records are patronymic-heavy. Add: derive/validate `-sen/-son/-datter/-dotter`
from a parent's given name, detect soldier/farm names, and normalize name variants for search and
duplicate detection (O). Complements the historical-date work in **I** and the parish-record
transcription already shipped. Keep raw name text verbatim (same fidelity rule as dates/places).

### S. Full UI internationalization + public share surface
Books are i18n'd (`lib/bookI18n.ts`) but the **app chrome is English-only**, while the product is
public-first. Localize the whole UI (da default + sv/no/en, reuse the `bookI18n` pattern). Per-entity
OpenGraph cards and crawlable public URLs live under roadmap **U** (crawler + agent discoverability).
Pairs with M5 (public book viewer) and A (multi-user).

### T. Data portability, backup & admin undo
`audit_logs` already records every mutation with actor + details. Leverage it: a one-click
**revert/undo** for recent admin actions, scheduled full-tree **JSON/GEDCOM-7 backup**, and a GDPR
"export everything for person/tree" + hard-delete path (ties to K7's deletable-on-demand rule).

### U. Crawler & agent discoverability (SEO + LLM webfetch) — IN PROGRESS 2026-07-04
Genealogy archives are meant to be **found and traversed** — by humans, classic search crawlers
(Google, Bing, DuckDuckGo), and the newer wave of **LLM / agent fetchers** (ChatGPT browse, Perplexity,
Claude web fetch, Gemini URL context, research bots, etc.). Today the app is a **client-rendered SPA**:
`index.html` carries only generic OG tags, public books at `/book/:id` hydrate in JS, and person/tree
deep links (`?tree=&person=`) have **no server HTML**, no sitemap, and no machine-readable graph —
so bots see an empty shell unless they execute JavaScript (many don't, or do so unreliably).

**Goal:** any bot — search indexer or research agent — can **land on a stable URL**, read who someone
is, follow parent/child/spouse links like a human would, and understand tree/book context without
guessing the app's internal state. Respect **privacy** (`RESN`, living persons, non-public trees) on
every surface; only `is_public` trees/books and non-restricted persons appear in crawlable indexes.

**Design note:** [sources/crawler-agent-discoverability.md](sources/crawler-agent-discoverability.md).
Pairs with **M5** (public books), **A** (auth + public RLS), **P** (relationship vocabulary), and **S**
(share-card copy/i18n).

**Shipped 2026-07-04 (foundation slice):**
- **U2** canonical paths `/tree/:id`, `/tree/:id/person/:pid` + legacy query redirect (`lib/publicRoutes.ts`, `App.tsx`).
- **U3** `public/robots.txt`, dynamic `/sitemap.xml` via `api/sitemap.xml.ts` + `list_public_sitemap_entries` RPC.
- **U6** `public/llms.txt` agent index.
- **U1/U4/U5** Edge HTML shells: `api/public/person/[personId].ts`, `api/public/tree/[treeId].ts`, JSON-LD + OG meta.
- **U7/U8** `?format=md` / JSON person API on the same route.
- **U10** crawler User-Agent buckets + `public_crawl_hit` logs; `middleware.ts` serves HTML to bots on `/tree/*`.

**Still open:** book HTML prerender for crawlers, sitemap-index chunking, admin crawler metrics UI, `noai` media meta, full in-app link hygiene audit (U9).

*Classic search crawlers (HTML-first):*

- **U1. Server-rendered public shells (highest leverage).** For public routes — tree home, person
  profile, book viewer — return **initial HTML with content** (Vercel SSR/ISR, Supabase Edge HTML, or
  a lightweight prerender pass). Minimum viable payload: person name, vital dates/places, relationship
  links as real `<a href="…">`, narrative excerpt, sources list. Without this, SEO is mostly cosmetic.
  _Person + tree shells shipped via Edge API; book shell still open._
- **U2. Stable, canonical URL scheme.** Document and enforce patterns, e.g.
  `/tree/:treeSlugOrId`, `/tree/:id/person/:personId`, `/book/:id` — with `<link rel="canonical">` and
  redirects from legacy `?tree=&person=` query URLs. Breadcrumb markup (`BreadcrumbList` JSON-LD).
  _Shipped 2026-07-04._
- **U3. `robots.txt` + dynamic `sitemap.xml`.** Allow public prefixes; disallow admin/auth/API. Sitemap
  lists every **public** tree landing page, person page, and book URL (respect `RESN` / living flags —
  omit restricted persons). Optional `sitemap-index` when trees are large; chunk person URLs per tree.
  _Shipped 2026-07-04 (no sitemap-index yet)._
- **U4. Per-entity meta + Schema.org.** OpenGraph/Twitter cards per person/tree/book (title, description,
  image). JSON-LD: `Person` (name, birth/death, `sameAs` for external ids), `WebSite`/`Organization` for
  the archive, `CreativeWork`/`Book` for family books. Use existing structured dates/places from GEDCOM
  P1 where safe to expose.
  _Person/tree JSON-LD + OG in HTML shells; client SPA meta still generic._
- **U5. Crawlable tree index & relationship graph in HTML.** A public tree landing page listing
  persons (paginated, filterable) with links — not only the interactive SVG pedigree. Each person page
  exposes **typed relationship sections** (parents, spouses, children, siblings) as link lists so
  crawlers can walk the graph without simulating pan/zoom.
  _Tree index + person relationship sections shipped in Edge HTML._

*LLM / agent fetchers (machine-readable navigation):*

- **U6. `llms.txt` (+ optional `llms-full.txt`).** Site-root agent-oriented index (emerging convention,
  analogous to `robots.txt`): what Linegra is, how public URLs work, privacy rules, and links to docs
  or sample person/tree URLs. Helps agents that prefetch site policy before deep-fetching.
  _Shipped `llms.txt` 2026-07-04._
- **U7. Alternate **plain / markdown** representations.** For public person/tree/book URLs, offer
  `?format=md` or `Accept: text/markdown` (or dedicated `/person/:id.md` paths) returning a concise,
  link-rich summary: vitals, relationships with absolute URLs, bio excerpt, source citations. Optimized
  for token-budget fetchers that prefer text over DOM parsing. Same privacy gates as HTML.
  _Person markdown shipped._
- **U8. JSON-LD / JSON API for agents.** Small, cacheable **`/api/public/person/:id`** (or Edge Function)
  returning normalized person + relationship edges + book back-links — for agents that request JSON
  directly. Include `rel: parent|child|spouse`, `href`, and human-readable `relationshipLabel` (reuse
  [../lib/relationshipCalculator.ts](../lib/relationshipCalculator.ts)). Rate-limit + cache headers.
  _Person JSON shipped with cache headers; rate-limit TBD._
- **U9. Internal link hygiene in rendered markup.** Avoid `javascript:` or click-only div navigation on
  public pages; every traversable edge in the tree should be a **followable anchor** with descriptive
  `title`/`aria-label` ("Father: …", "Child: …"). Helps both accessibility and agent heuristics that
  score `<a>` tags over canvas/SVG.
- **U10. Bot observability & policy.** Log agent/crawler hits on public routes (User-Agent buckets:
  `Googlebot`, `GPTBot`, `ClaudeBot`, `PerplexityBot`, etc.) in admin metrics; document opt-out in
  `robots.txt` where desired. Optional `noai` / `noimageai` meta for restricted media later.
  _Logging + robots policy shipped; admin Traffic panel shipped 2026-07-04._

*Privacy & sequencing:*

- **Never** expose living/restricted persons in sitemap, `llms.txt`, or alternate formats — reuse
  `RESN` + `inferLivingStatus` gates already used for GEDCOM export.
- **Sequencing:** U1 + U2 (rendered HTML + URLs) → U3 + U4 (sitemap + schema) → U5 (graph index) →
  U6–U8 (agent-specific formats) → U9–U10 (polish). Can ship book prerender (M5) before full tree SSR.
  _Foundation slice (U1–U8 partial, U10 logs) shipped 2026-07-04._

## Maintenance note (2026-06-23)
The 2026-06-22/23 work (M-series editing arc, L1, K1, husky hooks, DNA panel fixes) is **committed and
reflected here, but `log.md` was not updated for it** — the living log's newest entry is 2026-06-21,
so it's now behind the code. Backfill `log.md` from `git log` (commits `ae0299d`→`a7f9359`) to restore
the "newest at top" history. Also: two untracked artifacts sit in the working tree
(`FamilySearchGEDCOMv7.pdf`, a generated `… Hass-Jensen.pdf`) — gitignore them.

## Known stale references
- ✅ Resolved 2026-06-20: GEDCOM *parsing* now lives in `lib/gedcomParser.ts` (extracted from
  `ImportExport.tsx`); persistence is still `importGedcomToSupabase` in `services/archive.ts`,
  and GEDCOM *export* is still inline in `ImportExport.tsx`. `docs/CONTENT_MAP.md` updated; check
  `AGENT.md` for any remaining `lib/gedcom/*` mentions.

## How to pick the next item
Two lenses:
- **N (server-side AI proxy) is complete** (Phases 1–3, 2026-07-04): key server-side, usage logged, and
  per-tree/day caps enforced in ai-proxy. Residual abuse surface is publishable-key gating until roadmap **A**
  (real auth sessions).
- **For product leverage → A (multi-user auth)** — OAuth polish, ownership transfer, invite inbox; also
  hardens public surfaces (books, trees).

For user-facing progress on the themed groups: the **L interactive tree track (L1–L7)** and **M5 public book
viewer** are complete. **G** (performance guardrails) and **E** (GEDCOM fidelity) are done. Strong next
picks: **A** (auth), **U** (crawler/agent discoverability for public trees).

> **K1 correctness caveat:** `clusterSharedSegments` currently joins matches that overlap the *kit
> owner* on the same region. True triangulation/Leeds also requires the two matches to share that
> segment **with each other** (in-common-with) and to be on the **same parental side** — overlapping
> the owner's region on opposite parental chromosomes is a false cluster. Fold in ICW / parental-side
> data before presenting clusters as confirmed shared-ancestor groups.
