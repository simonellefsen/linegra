# Roadmap & Open Items

Candidate next work, derived from gaps between [../SPEC.md](../SPEC.md) / [../README.md](../README.md)
and the current code. **These are proposals to prioritize, not commitments.** When a item is
picked up, move it to [log.md](log.md) on completion.

## Status snapshot

Core archive, pedigree UI, GEDCOM import/export, DNA shared-match lineage, and OpenRouter AI
utilities are live and working. The app is single-super-admin today. No tests exist in-repo
(`tsc --noEmit` + eslint are the only automated gates).

## Candidate next work

### A. Multi-user collaboration (schema-ready, no UI)
The DB already models this: `tree_collaborators` (roles owner/editor, invite-by-email/profile,
status), and `can_read_tree`/`can_write_tree` already honor active collaborators. But there is
**no registration or collaborator-management UI**, and auth is a local super-admin in
`localStorage` ([decisions/local-superadmin-auth.md](decisions/local-superadmin-auth.md)).
- Wire Supabase Auth (email/OAuth) → real `auth.users` / `profiles`.
- Build a collaborators panel (invite, set role, revoke) on top of existing RLS.
- Migrate super-admin bootstrap onto a real account.
- **Highest-leverage** item: unlocks the security model the schema was built for.

### B. Retire / consolidate the legacy force graph
`components/FamilyTree.tsx` is retained alongside the pedigree view
([decisions/pedigree-over-force-graph.md](decisions/pedigree-over-force-graph.md)). Decide
whether to delete it or formally keep it as a debug view; remove dead code paths either way.

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

### E. GEDCOM fidelity
- Audit unsupported-tag warning coverage; ensure source+citation context is preserved on import
  (SPEC §5). Consider round-trip tests (import → export → diff).
- After import, set a sensible `defaultProbandId` on the new tree so the interactive tree opens on
  a chosen root rather than the arbitrary `treePeople[0]` (see 2026-06-20 tree-switch fix in log).

### H. GEDCOM 7.0 alignment — full gap analysis in [sources/gedcom7-alignment.md](sources/gedcom7-alignment.md)
Structure the schema + code around FamilySearch GEDCOM 7.0 while still importing 5.x. Phased:
- **P0 — DONE 2026-06-20:** `lib/gedcomTokenizer.ts` (`CONC`/`CONT` merge — recovers dropped
  notes, BOM strip, `@@` un-escape, `HEAD.GEDC.VERS` detect, `@VOID@`); `RESN` privacy on import.
- **Export — DONE 2026-06-20:** `serializeGedcom` now emits **GEDCOM 7.0 only** (BOM, `VERS 7.0`,
  `SCHMA` for `_LIVING`, valid xrefs + `UID`, structured names, `SEX` M/F/X/U, `RESN`, upper-cased
  dates, `CONT`). Verified on the real 2148-person tree.
- **P1 (schema spine):** structured dates (calendars/ranges/approx/BCE/PHRASE — lossless), `NAME`
  parts + `TYPE` + `TRAN`, `SEX` → M/F/X/U, full event detail (`TYPE`/`AGE`/`CAUS`/`AGNC`/value),
  `QUAY` 0–3, and `UID`/`EXID`/`REFN` (also fixes export round-trip ids).
- **P2:** new records — `REPO`, `SNOTE`, `OBJE`/MIME multi-file, `ASSO` associations.
- **P3:** compliant GEDCOM 7.0 exporter + `SCHMA` extension declarations + round-trip tests.
- Cross-cutting: keep raw GEDCOM payload for lossless round-trip; capture `gedcom_version` per import.

### F. AI utilities — DONE 2026-06-20
- ✅ Deterministic fallback for place parsing (`lib/placeParser.ts`); `parsePlaceString` now
  backfills/merges instead of returning bare `{ fullText }`.
- ✅ In-memory bounded caching (`lib/aiCache.ts`) for `parsePlaceString` + `normalizeDeathCause`.
- Possible follow-ups: persist the cache to `localStorage` across sessions; add deterministic
  fallbacks for `generateBio` / `analyzeHistoricalEra` (currently still key-dependent).

### G. Performance guardrails
- SPEC §7 demands no full-tree hydration. Add a lightweight check/benchmark on large trees
  (the 37 P. Gamby CSV / Big-Andersen GEDCOM fixtures in the repo root are useful test data).

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

## Known stale references
- ✅ Resolved 2026-06-20: GEDCOM *parsing* now lives in `lib/gedcomParser.ts` (extracted from
  `ImportExport.tsx`); persistence is still `importGedcomToSupabase` in `services/archive.ts`,
  and GEDCOM *export* is still inline in `ImportExport.tsx`. `docs/CONTENT_MAP.md` updated; check
  `AGENT.md` for any remaining `lib/gedcom/*` mentions.

## How to pick the next item
Default recommendation: **A (multi-user auth)** for product leverage, or **C (tests)** if the
goal is to make further refactors safe. Confirm priority with the user before large changes.
