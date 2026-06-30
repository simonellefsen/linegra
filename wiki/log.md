# Living Log

Chronological log of major progress, decisions, and learnings. **Newest at top.** Add an
entry whenever you ship a behavior change, make a notable decision, or hit a sharp edge worth
remembering. Keep entries short; link to wiki pages / commits / files.

---

> **Backfill note (reconstructed 2026-06-23):** the 2026-06-22/23 entries below were written after
> the fact from `git log` (commits `ae0299d`→`a7f9359`, authored in a Claude Fable 5 session) — that
> work shipped + was committed but not logged at the time. Build is green at **143 tests** as of the
> backfill.

## 2026-06-30 — REPO repository records + source-pointer resolution (roadmap H/P2)

Repository records (`0 @R1@ REPO` + `1 NAME <archive>`) and a source's `1 REPO @R1@` pointer reference
were dropped — a source using the REPO-pointer pattern lost its repository. Fixed in
[../lib/gedcomParser.ts](../lib/gedcomParser.ts): REPO records are parsed into a `parsedRepositories`
map, and a source's `1 REPO @R1@` is deferred to `pendingRepoRefs` and resolved after the pass (so
forward refs work) into `source.repository` (AUTH takes precedence if both are present). Because the
person-level source copies are built during the pass — before REPO resolution — resolved repositories
are re-flowed into them in a backfill pass; those copies now also carry `callNumber` and
`abbreviation` (previously dropped). 3 tests. Build green at **244 tests**. Remaining P2:
`OBJE`/MIME media.

---

## 2026-06-30 — ASSO associations capture + export (roadmap H/P2)

`1 ASSO @I2@` + `2 RELA godparent` (associations to other people — witnesses, godparents, etc.) were
dropped entirely. Fixed in [../lib/gedcomParser.ts](../lib/gedcomParser.ts): ASSO targets are captured
into `person.metadata.associations` (`[{ personId, rela? }]`), with `2 RELA` attaching to the most-
recent ASSO via a `currentAssociation` tracker. Stored as ancillary person metadata — **no
Relationship-type or DB-enum change (no migration)**. Export emits `1 ASSO @<targetXref>@` + `2 RELA`
for each, skipping any target not in the export set (no dangling references). 4 tests incl. round-trip.
Build green at **241 tests**. Remaining P2: `REPO`, `OBJE`/MIME media.

---

## 2026-06-30 — SNOTE shared-note resolution on import (roadmap H/P2)

`1 NOTE @N1@` pointer references — common in FamilySearch/Ancestry exports that share one note across
many records — were stored as the literal string `@N1@`, losing the note's text. Fixed in
[../lib/gedcomParser.ts](../lib/gedcomParser.ts): level-0 shared-note records (`0 @N1@ SNOTE` in
GEDCOM 7, `0 @N1@ NOTE` in 5.5.1) are captured into a `parsedSharedNotes` map (the tokenizer already
merges CONT/CONC into the value, so multi-line text is captured), and `appendNote` now defers
`@N1@` pointer references to a `pendingNoteRefs` list that is resolved **after** the parse pass — so
forward references (SNOTE record appearing after the person who cites it) work. Unresolved pointers
are dropped silently. Export still emits notes inline (valid GEDCOM; dedup back into shared SNOTE
records is a follow-up). 5 tests; build green at **237 tests**.

---

## 2026-06-30 — Book versioning: history + restore + publish (roadmap M4)

The book editor ([../components/book/BookEditor.tsx](../components/book/BookEditor.tsx)) now keeps a
**version history**. Each Save/Publish records a snapshot (title + subtitle + chapters), deduped
against the latest (no snapshot when nothing changed) and capped at 25. A new **History** panel lists
snapshots with timestamps + chapter counts and a one-click **Restore** (non-destructive — it loads the
snapshot as an editable draft; the source snapshot stays pristine). A **Publish** button saves with
`status: 'complete'` and records a Publish-tagged snapshot; the toolbar shows a "Published" chip when
the book is complete.

Logic is pure + unit-tested in new [../lib/bookVersions.ts](../lib/bookVersions.ts) (8 tests:
snapshot/deep-copy, dedup, cap, restore-non-destructive, draft-on-restore). Persistence is
browser-localStorage in [../lib/bookVersionStore.ts](../lib/bookVersionStore.ts) — **no migration**,
works immediately per-browser. Deferred to M5: server-side snapshots (`family_book_versions` table +
`published_chapters` column) for cross-device history and a viewer-facing published snapshot. Build
green at **232 tests**.

---

## 2026-06-30 — Non-vital event export + lossless round-trip harness (roadmap H/P3)

The exporter dropped non-vital events entirely (OCCU/RESI/EVEN/CHR/…), so all the event data the
importer captures — including the AGE/CAUS/AGNC from P1 — couldn't round-trip. Fixed: new
`emitCustomEvent` in [../lib/gedcomParser.ts](../lib/gedcomParser.ts) emits each non-vital event as
its GEDCOM tag (`1 OCCU Blacksmith`, or `1 EVEN` + `2 TYPE` for unknown types) with `2 DATE` / `2 PLAC`
/ `2 AGE` / `2 CAUS` / `2 AGNC`. Birth/Death/Burial stay on `emitVital`.

Plus a comprehensive **lossless round-trip test**: a richly-populated person (dates incl. Julian
calendar, UID/EXID/REFN, alternate names, deathCause, structured dates, an event with AGE/CAUS/AGNC)
survives export → import field-for-field. This locks in all of P1 as a regression guard. Build green
at **224 tests**. P3's exporter + round-trip goals are met; P2 (new record types REPO/SNOTE/OBJE/ASSO)
remains.

---

## 2026-06-30 — Structured-date persistence + calendar round-trip — P1 complete (roadmap H)

The final P1 piece. Two changes in [../lib/gedcomParser.ts](../lib/gedcomParser.ts):
- **Persist the parsed `StructuredDate`** for each vital into `person.metadata` jsonb
  (`birthDateStructured` / `deathDateStructured` / `burialDateStructured`) at import. The roadmap had
  flagged this as needing a DB migration; it doesn't — `persons.metadata` already round-trips
  (`mapDbPerson` returns the whole object), so no migration, same pattern as UID/EXID/REFN. The
  structured form (calendar/qualifier/range/BCE/phrase) is now available post-load without re-parsing.
- **Emit the GEDCOM 7 calendar keyword** for non-Gregorian dates on export (`toGedcom7Date` now prefixes
  `JULIAN`/`FRENCH_R`/`HEBREW`), so a Julian `3 MAR 1712` round-trips with its calendar intact instead of
  being silently re-inferred as Gregorian — the concrete fidelity win.

4 tests incl. Julian calendar round-trip. Build green at **222 tests**. **P1 (schema spine) is
complete** — structured dates, UID/EXID/REFN, QUAY, NAME parts/TYPE/TRAN, AGE/CAUS/AGNC all shipped.

---

## 2026-06-30 — Event detail AGE/CAUS/AGNC (roadmap H/P1)

The last no-migration P1 slice. [../lib/gedcomParser.ts](../lib/gedcomParser.ts) now captures event
substructures that were previously dropped:
- **`CAUS`** — `DEAT.CAUS` (the canonical cause of death) routes to `person.deathCause`, and
  `emitVital` now re-emits it as `2 CAUS` on export (it was silently dropped before). Other events
  keep their cause in `event.metadata.cause`.
- **`AGE`** — age at the event: custom events store it on `event.metadata.age`; vitals (which have no
  event row) store it on `person.metadata.{birt|deat|buri}Age`.
- **`AGNC`** — responsible agency/institution → `event.metadata.agency`.

5 tests (incl. deathCause round-trip). Build green at **218 tests**. **All no-migration P1 fields are
now done** (structured-date spine, UID/EXID/REFN, QUAY, NAME parts/TYPE/TRAN, AGE/CAUS/AGNC). The sole
remaining P1 piece is persisting the structured date, which needs a DB migration.

---

## 2026-06-29 — NAME.TRAN transliteration capture (roadmap H/P1)

`NAME.TRAN` — a transliteration/translation of a name (e.g. `Иван /Смирнов/` → `Ivan /Smirnov/`) — is
now captured on import as an `Anglicized Name` alternate name. It round-trips via the alternate-name
export added in the prior commit (`2 TYPE immigrant`). **P1 name structure is complete** (NAME parts
+ TYPE + TRAN). Round-trip tests; build green at **213 tests**.

---

## 2026-06-29 — NAME TYPE + alternate-name export round-trip (roadmap H/P1)

Structured names. Two gaps closed in [../lib/gedcomParser.ts](../lib/gedcomParser.ts):
- **Import dropped `NAME.TYPE`** — every alternate name was hard-coded to "Also Known As". Now `2 TYPE`
  under a NAME sets the real type via new [../lib/nameTypes.ts](../lib/nameTypes.ts) (GEDCOM 7
  `aka`/`birth`/`maiden`/`married`/`immigrant`/`name-changed`/`nickname`/… ↔ `AlternateNameType`),
  and `2 NICK` is captured as a Nickname alternate name.
- **Export dropped alternate names** — only the maiden (`2 TYPE MAIDEN`) was emitted; AKA / married /
  nickname alternates were silently lost. Now every alternate name is emitted as `1 NAME` + `2 TYPE`,
  so the name set round-trips (skipping one that duplicates the maiden).

Round-trip + mapping tests (7). Build green at **211 tests**. Remaining P1: persist structured date
(schema), `TRAN` (name transliteration), full event detail (`AGE`/`CAUS`/`AGNC`).

---

## 2026-06-29 — QUAY source-certainty: typed + surfaced in the Sources tab (roadmap H/P1)

QUAY (the GEDCOM 0–3 source-citation certainty) was already round-tripping as a free-text string
through the `citations.quality` column and the exporter's `1 QUAY` line — the gap was that it wasn't
typed or visible. Now:
- New `Quay` type (0–3) on `Citation` + [../lib/sourceQuality.ts](../lib/sourceQuality.ts)
  (`parseQuay` validates 0–3, `QUAY_LABELS`: Unreliable/Questionable/Secondary/Primary). 5 tests.
- Import sets `citation.quay`; `mapDbCitation` derives it from the persisted `quality`; the DB write
  falls back to `quay` so a curator-set certainty persists even with no text quality.
- **Sources tab** ([../components/person-profile/SourcesTab.tsx](../components/person-profile/SourcesTab.tsx)):
  each citation gains a Certainty selector (Not rated / 0–3 with labels).

Live click-through was blocked by an agent-browser/Playwright harness outage, but the dev server
stayed healthy (HTTP 200) and Vite HMR'd SourcesTab with no transform errors. Build green at **204
tests** (+5).

---

## 2026-06-29 — UID/EXID/REFN capture + emit, GEDCOM round-trip identity (roadmap H/P1)

The identity portion of P1. [../lib/gedcomParser.ts](../lib/gedcomParser.ts) now captures `UID`,
`EXID` (+`EXID.TYPE`), and `REFN` (+`TYPE`) from INDI records into `person.metadata` (the existing
jsonb column — **no migration**) on import, and re-emits them on export. Previously export minted
`1 UID <internal-uuid>`, discarding the source's UID; now the **original source UID is preserved
verbatim** (falling back to the internal id only when none was captured), so import → export → import
keeps record identity. EXID/REFN (which can repeat, each with a TYPE) round-trip too. Added `EXID`/
`REFN` to the supported-tags set (no more "ignored tag" warnings for them) and a small
`currentIdentifier` tracker so a level-2 `TYPE` attaches to the right EXID/REFN. 5 round-trip tests.
Build green at **199 tests**.

---

## 2026-06-27 — Lossless structured-date parser, the GEDCOM date spine (roadmap H/P1)

The date portion of P1. New [../lib/gedcomDate.ts](../lib/gedcomDate.ts) interprets GEDCOM 5.5.1/7
dates into a lossless `StructuredDate` — `raw` verbatim (round-trip exact) + `calendar`
(GREGORIAN/JULIAN/FRENCH_R/HEBREW) + `qualifier` (about/calculated/estimated/before/after/between/
from/to/from-to) + range bounds (`yearFrom`/`yearTo`) + BCE + parenthesized `phrase`. Handles
`ABT 1807`, `BET 1800 AND 1805`, `FROM 1880 TO 1890`, `30 FEB 1712` (real Swedish-calendar date),
`1700 B.C.`, French/Hebrew month names, and an explicit `JULIAN` keyword. Gregorian month names are
not calendar-authoritative (shared with Julian) — only French/Hebrew names and an explicit keyword
are. 19 parser tests, incl. legacy-parity cases.

Adopted in `extractBirthYear` ([../lib/lifespan.ts](../lib/lifespan.ts)): it now delegates to
`dateYear` (representative year = range start, so behavior is unchanged for every existing input)
while quietly gaining qualifier/BCE/calendar awareness — so lifespan inference, the data-quality
checks, book chapter facts/ordering, and admin tree listing all parse dates properly with **zero
test regressions**. Foundation for roadmap **I** (Julian↔Gregorian keyed off calendar+place).
Remaining P1: persisting the structured form (schema), NAME parts/TYPE/TRAN, full event detail,
QUAY, UID/EXID/REFN. Build green at **194 tests** (+19).

---

## 2026-06-27 — Shared-cM on DNA-backed pedigree edges (roadmap L1 complete)

The last sliver of L1: DNA-backed pedigree edges now show how strong the DNA evidence is. Each DNA
badge gained the **strongest backing shared-cM** beneath the match count (e.g. `5` over `1116cM`), and
the edge hover tooltip reads `parent → child · DNA-backed · 116 cM`. Changes:
- New pure [../lib/dnaSupport.ts](../lib/dnaSupport.ts) — extracts the `dna_matches.id` values stamped
  on `relationships.metadata.dna_support_by_person` (tolerates the legacy `string[]` and structured
  `{ match_ids }` shapes). DRY: shared by App and PedigreeTree (7 unit tests).
- [../services/archive.ts](../services/archive.ts) `fetchDnaMatchCm(matchIds)` → `Map<id, shared_cm>`.
  `dna_matches` has **no `tree_id`** (its RLS scopes via `persons`), so cM is fetched by the match-id
  set, not per tree.
- App collects the tree's backing match ids and fetches cM once (re-fetches only when that id set
  changes), threading a `dnaMatchCmById` prop into
  [../components/InteractiveTree/PedigreeTree.tsx](../components/InteractiveTree/PedigreeTree.tsx).

Live-verified on Gether-Nielsen: badges render count + cM, tooltips carry the cM. **L1 is complete.**
Build green at **175 tests** (+7).

---

## 2026-06-27 — Richer book structure: section dividers + per-chapter status (roadmap M3)

Family books gained two structural features in
[../components/book/BookEditor.tsx](../components/book/BookEditor.tsx) /
[BookDocument.tsx](../components/book/BookDocument.tsx):

- **`section` chapter kind** — a structural Part divider ("Part I · The Old Country") with a title +
  optional blurb, rendered as a centered break page in print and as a group header in the TOC (other
  chapters indent under it when any section exists). Added via `createSectionChapter` in
  [../lib/bookComposer.ts](../lib/bookComposer.ts); the editor's "Add section divider" button.
- **Per-chapter `status`** (`draft` / `edited` / `locked`) on `BookChapter`. The editor shows it as a
  badge; editing title/narrative flips `draft → edited`; a per-card lock toggle freezes the text
  (readOnly) and disables Regenerate; regenerating resets to `draft`. `BookChapterStatus` lives on
  `BookChapter`, riding the existing `chapters` jsonb — **no migration**, round-trips through
  `services/books.ts` unchanged.

Types: `BookChapterKind` is now `'overview' | 'person' | 'custom' | 'section'`. Build green at **168
tests** (+1 for `createSectionChapter`). Live-verified in the editor: status badges render, both add
buttons work, the section card's blurb placeholder shows, and typing flips a chapter `Draft → Edited`.

---

## 2026-06-26 — Retired the legacy force-graph renderer (roadmap B)

Deleted [../components/FamilyTree.tsx](../components/FamilyTree.tsx) — it was unreachable.
`layoutType` was `useState<TreeLayoutType>('pedigree')` with **no setter**, so the
`layoutType === 'pedigree' ? <PedigreeTree/> : <FamilyTree/>` ternary in App.tsx always took the
pedigree branch; the force-graph else-branch was dead code that could never render. Removed the
component, its import, the dead branch, and the now-unused `layoutType` state + `TreeLayoutType`
import. Bundle dropped **765→703 KB** (d3-force no longer in the graph). Done only after porting its
one useful trait — `RelationshipConfidence` edge encoding — into the live pedigree view (see the L1
entry below). The layout-persistence/audit subsystem (`persistFamilyLayout` /
`fetchFamilyLayoutAudits`, used by the admin Database panel and `PersonProfile`) is unrelated and
kept. Decision doc updated; `TreeLayoutType` stays in `types.ts` as the extension point for future
fan/descendant views (L2/L3). Build green at **167 tests**.

---

## 2026-06-26 — Pedigree edges encode relationship confidence (roadmap L1)

The live pedigree view ([../components/InteractiveTree/PedigreeTree.tsx](../components/InteractiveTree/PedigreeTree.tsx))
now encodes `RelationshipConfidence` on its edges instead of a meaningless per-child pastel:
**Confirmed** → bold indigo, **Probable** → indigo, **Assumed** → slate, **Speculative** → faint
dashed slate, **Unknown** → dotted; **unset** confidence falls back to the default lineage indigo so
the common (unsourced) case doesn't regress. DNA-backed lineages still trace emerald and override the
confidence style. Each edge has a hover `<title>` (e.g. "parent → child · Confirmed") and the legend
now lists every style. Mirrors the confidence encoding the legacy force graph already had
(`components/FamilyTree.tsx` `getLinkStroke`). Built a `parentalRelationshipByKey` map from all tree
relationships so edges look up their confidence regardless of visible scope (same fix pattern as the
DNA-support map). **L1 remaining:** shared-cM on DNA-backed edges — needs a `dna_matches` join not yet
wired into the tree. Also marked roadmap **O** (data-quality engine) and **P** (relationship
calculator) DONE — both shipped 2026-06-23 but the roadmap still listed them open. Build green at
**167 tests**.

---

## 2026-06-23 — DNA admin: "Resolve all matches" in one action

The DNA admin panel ([../components/AdminDnaPanel.tsx](../components/AdminDnaPanel.tsx)) gained a
**Resolve all matches** button: `handleResolveAllLineages` runs sequentially over every loaded
shared-autosomal match for the selected person — live progress, per-match failure tolerance, a
summary — so the `dna_support_by_person` annotations (and the pedigree DNA badges) repopulate without
resolving one match at a time. Reuses `resolveSharedMatchLineage`/`resolveSharedTestLineage` and fires
the same `dna-lineage-resolved` event; per-match buttons disable while a batch runs. (commit `a7f9359`)

---

## 2026-06-22 — DNA-aware pedigree overlay + badge scope fix (roadmap L1)

DNA-confirmed lineages are now visible directly on the pedigree tree, and the DNA badges stopped
disappearing on click.

- **Emerald DNA edges (L1).** A child's incoming edge traces emerald (not the lineage pastel) when
  the link is DNA-backed (`dnaSupportByPersonId`), with a small legend (DNA-backed / Lineage)
  ([../components/InteractiveTree/PedigreeTree.tsx](../components/InteractiveTree/PedigreeTree.tsx)).
  Complements the per-person DNA count badges with an edge-level signal. (commit `2460d54`)
- **Badge scope + flicker fix.** `dnaSupportByPersonId` was built from `pedigreeScope.relationships`
  (the visible subset), so badges were incomplete and vanished when clicking a person (re-centering
  recomputes the scope). `PedigreeTree` now takes an `allRelationships` prop and builds the support
  map from **all** tree relationships (App passes `treeRelationships`) — complete counts, stable
  across focus changes. (commit `5168da9`)
- **Still resolution-gated:** badges only trace matches whose lineages have been resolved (the
  `dna_support_by_person` annotations written by `resolveSharedMatchLineage`); unbadged paths need
  resolving in the DNA admin panel (now one click — see 06-23 above). Remaining L1: encode
  `RelationshipConfidence` via edge style + surface shared-cM (needs a `dna_matches` join).

---

## 2026-06-22 — K1: DNA segment-clustering engine (triangulation)

New pure [../lib/dnaClustering.ts](../lib/dnaClustering.ts) (`segmentsOverlap` +
`clusterSharedSegments`): groups shared-segment matches by mutual genomic overlap via **union-find**,
with a `minCentimorgans` filter; returns connected-component clusters (largest first, singletons
omitted). No I/O — **11 tests** cover overlap rules, transitive clustering, separate clusters, the cM
threshold, and sort order. Foundation for K1 (Leeds-style clustering) + K5 (segment painter). (commit
`7cd7ca3`)

- **Not yet wired to any UI** (the "cluster matches" view in the DNA panel is the next slice), and a
  **correctness caveat** applies: overlapping the *kit owner's* region isn't true triangulation —
  two matches can overlap the same region on opposite parental chromosomes (false cluster). Fold in
  in-common-with / parental side before presenting clusters as confirmed shared-ancestor groups. (See
  [roadmap.md](roadmap.md) K1 caveat.)

---

## 2026-06-22 — AI books & biographies become editable (roadmap M arc)

The books pillar went from **write-once / AI-only** to **fully human-editable + grounded**, in one
arc. Foundation policy: [decisions/ai-narrative-editing-and-grounding.md](decisions/ai-narrative-editing-and-grounding.md)
(AI output is always a first draft a human owns and can edit; grounded claims are distinguishable
from interpolation).

- **M6 — manual biography editing.** StoryTab
  ([../components/person-profile/StoryTab.tsx](../components/person-profile/StoryTab.tsx)) gained an
  edit mode (textarea + Save/Cancel) persisting with `is_manual=true`, a **Curated / AI draft** tag,
  and a confirm-before-overwrite when AI-rewriting a curated bio. `composeBook` no longer silently
  regenerates manual bios — new `shouldReuseBiography()` (6 tests) preserves human text verbatim even
  when stale/force-regenerated. (commit `ae0299d`)
- **M1 — in-UI book editor.** New `BookEditor` overlay
  ([../components/book/BookEditor.tsx](../components/book/BookEditor.tsx)): edit book title/subtitle +
  each chapter's title/narrative, reorder chapters, add/remove **custom** free-text chapters, preview,
  save via `saveFamilyBook`. `BookChapterKind` gained `'custom'`; pure `moveChapter`/`removeChapter`/
  `createCustomChapter` helpers (5 tests) in [../lib/bookComposer.ts](../lib/bookComposer.ts);
  `BookDocument` renders chapters in editable array order. (commit `a0512c1`)
- **M2 — single-chapter regeneration.** Each overview/person chapter in the editor has a Regenerate
  button (overview → `composeFamilyOverview`, person → `composePersonBiography`, resolving the Person
  from the tree), leaving the rest intact; custom chapters aren't regenerable. (commit `e389a1f`)
- **M7 — richer biography inputs.** `BookChapterFacts` now carries compact **life events** (residence/
  military/education/occupation, capped 8) + a **source count**; `buildChapterFacts` maps
  `person.events` and feeds them into the prompt and the composition cache key (events change →
  bio regenerates). (commit `921deb1`)
- **M11 — fact-grounding.** New `groundingSummary(facts)` (3 tests) renders a "Grounded in: …" footer
  on AI-draft bios (Story tab) and person chapters (printed book); curated bios omit it. The prompt
  now instructs the model to state documented facts plainly and **hedge** inferred/contextual material
  ("would have", "likely"). (commit `c6a69d6`)
- **M10 — AI-assisted text ops.** New `aiAssistedEdit` ([../services/ai.ts](../services/ai.ts))
  transforms the *current editor text* in place (rewrite / formal / concise / expand / translate) —
  distinct from regenerate-from-facts — surfaced via a shared `components/common/AiTextOps` toolbar
  reused by the bio editor and each book chapter; graceful no-key fallback returns the text unchanged.
  (commit `0ca0a3d`)
- **M12 — housekeeping.** Removed the unused legacy `generateBio` (superseded by
  `composePersonBiography`). (commit `dd39977`)
- Remaining in M: M3 (richer book structure — `custom` kind landed), M4 (versioning), M5 (public
  viewer, gated by roadmap A), M8 (per-bio style controls), M9 (streaming).

---

## 2026-06-22 — Husky git hooks (version-controlled build gate)

Broken code can no longer be committed or pushed: `.husky/pre-commit` runs lint + typecheck (fast),
`.husky/pre-push` runs the full `npm run build` gate (lint + typecheck + tests + vite build). husky is
a devDependency with a `prepare` script so hooks auto-install on `npm install`. Bypassable locally
with `--no-verify`; server-side enforcement (GitHub Actions + branch protection) is the follow-up.
(commit `00b89bd`)

---

## 2026-06-21 — Structured places lost on reload (Residence at Death + event places)

Manually-entered location details (the PlaceInput "Details" fields) vanished after reloading the
profile for two of the place fields — the structured object was **saved** but never **read back**:

- **Residence at Death.** Saved to `metadata.structured_residence_at_death`, but `mapDbPerson`
  ([../services/archive.ts](../services/archive.ts)) read only `residence_at_death_text`. Now reads
  the structured object first, text as fallback.
- **Event (Life Chronology) places.** Saved to `person_events.metadata.structured_place`, but the
  event mapper read only `place_text`. Now restores the structured object (and passes event
  `metadata` through). Also made `PersonEvent.metadata` explicit in [../types.ts](../types.ts)
  (`eventsPayload` already used it).

Vital birth/death/burial places already round-tripped (`structured_*_place` was read back); only
these two were broken. Build green, **116 tests**.

---

## 2026-06-21 — Removed "AI Structure" button from PlaceInput

The "AI Structure" button on the location input overlapped the text field and produced unreliable
(garbled) structured output, so it was removed. Places are now structured **manually** via the
existing PlaceInput "Details" fields ([../components/PlaceInput.tsx](../components/PlaceInput.tsx)) —
street/number/floor/apartment, stednavn/by/sogn/herred-kommune/amt/land, plus history/notes.

- Removed the button, `handleSmartParse`, the `isParsing` state, and the now-unused
  `parsePlaceString` / `Sparkles` / `Loader2` imports from `PlaceInput`. Restored the input's right
  padding (`pr-24` → `pr-4`).
- `parsePlaceString` stays exported in `services/ai.ts` (still unit-backed via the deterministic
  fallback in [../lib/placeParser.ts](../lib/placeParser.ts)); it's just no longer wired to the UI.
  Tree-shaken out of the bundle since nothing imports it.

Build green, **116 tests**.

---

## 2026-06-21 — Source URL openable + AI page-image transcription

- **Source URL is now editable *and* clickable.** The URL field became a dedicated `UrlField`
  ([../components/person-profile/SourcesTab.tsx](../components/person-profile/SourcesTab.tsx)): a text
  input (type/paste a link) with a trailing external-link icon that opens it in a new tab whenever a
  usable URL is present — for editors *and* viewers. (Normalizes a bare `example.com` to `https://`.)
- **AI Transcribe.** Each source card's transcription area gained an **AI Transcribe** button: pick a
  scanned page image, it's downscaled client-side (canvas, ≤1600px JPEG data URL — avoids CORS and
  keeps the payload small) and sent to the vision model, which fills the Transcription field. Prompt is
  tuned for Nordic parish registers (Danish/Norwegian/Swedish + Latin, gothic/kurrent script): faithful
  line-by-line, original language/spelling preserved, `[illegible]` markers, no translation/invention.
  - New `transcribeRecordImage(imageDataUrl, hints)` ([../services/ai.ts](../services/ai.ts)) widens the
    chat message type to allow `image_url` parts; single attempt, 60s timeout; throws a clear error
    (with a "set a vision-capable `-vl` model" hint) if the configured model can't handle images.
  - **Why upload, not the URL:** the DK/SE/NO archive record URLs open a *viewer page*, not a raw
    image, and the browser can't fetch those cross-origin — so the URL can't be turned into an image
    client-side. The source's URL stays as the human reference link; the image comes from a file the
    user captures. (There is no backend/edge function yet, so OpenRouter is called directly from the
    browser with the API key.)
  - Gated by `aiAvailable` + edit rights; shows a thumbnail preview + inline error.

Build green, **116 tests**. (Vision call itself not exercised live — needs an image + configured key.)

---

## 2026-06-21 — Source/evidence badge states (Vital tab)

Follow-ups to the source-reuse work, all reported against the Sources/Vital UI:

- **Source counter was gone.** After the dedup refactor a source no longer carries a per-source
  `event`, so `getSourceCountForEvent` ([../components/PersonProfile.tsx](../components/PersonProfile.tsx))
  always returned 0 and the bookshelf badge disappeared. It now counts the **distinct sources cited**
  for an event (via `citations`), so the red bookshelf shows its number again.
- **Bookshelf stopped auto-adding.** The Vital-tab bookshelf called `onAddSource`, creating a blank
  source on every click. It now just **switches to the Sources tab** (`onOpenSources`); adding is done
  explicitly via New Source / Cite Existing inside the tab. `VitalTab` dropped its `onAddSource` prop.
- **"New Source Record" placeholder heading.** New sources no longer default to that junk title
  (`handleAddSource` → `title: ''`), and the card heading treats the legacy `"New Source Record"`
  string as untitled, falling back to **abbreviation → type** ([../components/person-profile/SourcesTab.tsx](../components/person-profile/SourcesTab.tsx));
  the redundant abbreviation subtitle is hidden when it's already the heading. `sourcesPayload` also
  falls back to abbreviation so GEDCOM export gets a real title.
- **Empty badges now look empty.** The source (rose library) and media (sky image) indicators were
  *always* colored, so an event with no evidence still looked active. They now gray out
  (`text-slate-300 cursor-default`, no-op) when the count is 0 — matching the notes badge, which was
  already correct. Applied in both the Birth/Death/Burial rows and the Life Chronology events
  ([../components/person-profile/VitalTab.tsx](../components/person-profile/VitalTab.tsx)).

Build green, **116 tests**.

---

## 2026-06-21 — Reusable tree-wide sources + citations (incl. GEDCOM export)

A source that documents several events (e.g. one *dødsannonce* for both a death and a burial) used
to show up as **duplicate cards** and could not be referenced again — and GEDCOM export dropped
sources entirely. The DB model was already right (`sources` are tree-scoped documents; `citations`
link a source to a person/event), so this was a client + RPC + export change.

- **Load no longer fans out.** `fetchPersonDetails` ([../services/archive.ts](../services/archive.ts))
  now dedupes by source row — one card per source, with its event citations listed beneath.
- **Citations are a first-class payload.** `admin_update_person_profile` gained `payload_citations`
  ([../supabase/migrations/20260621170000_source_citations_payload.sql](../supabase/migrations/20260621170000_source_citations_payload.sql)
  — applied 2026-06-21); one source can carry many event citations. Legacy callers (no citations
  payload) keep the old per-source behavior.
- **Tree-wide reuse.** New `listTreeSources` (RLS `can_read_tree`) backs a **Cite Existing** picker —
  attach an existing tree source to a new event without re-entering it. **Add Citation** attaches a
  source to another event. Source removal only drops *this person's* citations (the shared source
  stays for others).
- **Merge tool.** `admin_merge_sources` (same migration) consolidates duplicate source rows into a
  canonical one, repointing citations and collapsing duplicates; UI lists same-titled sources for
  one-click merge.
- **GEDCOM export of sources.** `serializeGedcom` ([../lib/gedcomParser.ts](../lib/gedcomParser.ts))
  now emits one `0 @Sn@ SOUR` record per document (emitted before INDI so the single-pass import
  resolves forward refs), with `2 SOUR @Sn@` under BIRT/DEAT/BURI for event citations (PAGE/DATA/QUAY)
  and `1 SOUR @Sn@` at the person level otherwise. Import already deduped correctly, so it round-trips.
- Tests: shared-source export, person-level fallback, export→import round-trip. Suite **116 tests**,
  build green. Verified live: one source cited for Death + Burial as a single card; Cite Existing
  lists the tree library (incl. a just-created source → reusable across people).

---

## 2026-06-21 — Danish place hierarchy (Sogn, Herred/Kommune, Amt)

Place inputs now model the full Scandinavian administrative hierarchy instead of mashing it into
city/county. `StructuredPlace` gained **`parish`** (Sogn — the key unit for church records) and
**`hundred`** (Herred/Kommune); street-level gained Danish floor (kælder/stue/1. sal…) and apartment
(baggården) suggestions. No migration — structured places already persist whole in
`metadata.structured_*` jsonb ([../services/archive.ts](../services/archive.ts)).

- **Deterministic parse** ([../lib/placeParser.ts](../lib/placeParser.ts)) classifies 5+ part
  addresses by keyword (sogn→parish, herred/kommune→hundred, amt→county, region→state), falling back
  to positional so existing non-Danish tests still pass. "Rosengade, Brædstrup, Ring Sogn, Tyrsting
  Herred, Skanderborg Amt, Danmark" now lands each segment correctly.
- **AI Structure** ([../services/ai.ts](../services/ai.ts)) schema + prompt describe the hierarchy so
  the model fills parish/hundred too.
- **PlaceInput** ([../components/PlaceInput.tsx](../components/PlaceInput.tsx)) rebuilt with distinct
  fields — Stednavn, By, Sogn, Herred/Kommune, Amt/Region, Land — and floor/apartment `<datalist>`
  suggestions.
- `placeToText` ([../lib/bookComposer.ts](../lib/bookComposer.ts)) includes parish/hundred in
  composed prose. New parser tests; suite **113 tests**, build green. Verified live: AI Structure on
  the Brædstrup example fills all six locality fields.

---

## 2026-06-21 — GEDCOM round-trip for partner unions

Following the partner-union work above, `partner` unions now survive a GEDCOM export/import cycle
(GEDCOM 7.x has no dedicated partner type, so we map through `MARR.TYPE`). In
[../lib/gedcomParser.ts](../lib/gedcomParser.ts):

- **Import**: `deriveUnionType` reads a `FAM`/`MARR.TYPE` and returns `partner` for cohabiting values
  (COMMON LAW, PARTNERS, cohabit, unmarried, sambo…) and `marriage` otherwise. The matched type is no
  longer echoed into the relationship notes when it is structural.
- **Export**: `serializeGedcom` now emits a `FAM` for `partner` as well as `marriage`, adding
  `2 TYPE COMMON LAW` so a cohabiting couple re-imports as `partner`.

New GEDCOM tests (import mapping + export/double round-trip); suite **110 tests**, build green.

---

## 2026-06-21 — Partner unions + honest death handling in biographies

Two biography-correctness fixes, both surfaced by the Pernille Gether Gamby chapter:

- **Unmarried partner unions.** A couple that lived together but never married is now a first-class
  `partner` union, distinct from a formal `marriage`, and the biography honors the difference.
  GEDCOM 7.x has **no** dedicated partner-union type (a cohabiting couple can only be hinted at via
  `MARR.TYPE COMMON LAW`), so Linegra keeps its own `partner` type. New:
  - `admin_update_relationship_details` gained a guarded `payload_union_type` (only `marriage`/
    `partner` accepted — parental types can never be re-typed this way). Migration
    [../supabase/migrations/20260621160000_union_type_rpc.sql](../supabase/migrations/20260621160000_union_type_rpc.sql)
    — **applied to remote DB 2026-06-21**.
  - The profile **Family → Edit Union** panel has a **Union Type** selector (Married / Partners),
    and the spouse card shows `Partners` vs `Married` at a glance.
  - `BookChapterFacts` now carries `partnerNames` alongside `spouseNames`
    ([../lib/bookComposer.ts](../lib/bookComposer.ts)); the deterministic + AI composers word them
    differently (`b.partner` → "levede sammen med … som ugift par"), so a cohabiting partner is never
    said to have "married" the subject.
- **No death sentence for the living.** The deterministic biography used to append "circumstances of
  death are not recorded" to *anyone* lacking a death year — including living people. It now gates the
  whole death section on `inferLivingStatus` ([../lib/lifespan.ts](../lib/lifespan.ts)): still-living
  subjects get no death mention at all; the "death not recorded" sentence appears only for someone
  presumed deceased (recorded death/burial, or a birth year beyond a plausible lifespan). The AI
  prompt gets matching living/deceased guidance.
- New tests: partner/spouse fact split, and the living-vs-deceased + partner-wording biography
  behavior ([../lib/aiBookFallback.test.ts](../lib/aiBookFallback.test.ts)). Suite **105 tests**,
  build green.

---

## 2026-06-21 — Per-person biographies + incremental book composition

To stop re-running the AI for every chapter on every book build (and to give each person an
evolving story on their profile), biographies are now **persisted per person, per language**, and
books are **compiled from them** — only people who *changed* since their last biography are
re-written.

- **Store**: new `person_biographies` table (one row per person+language: `narrative`, `signature`,
  style/length, `is_manual`) + `admin_upsert_person_biography` RPC + RLS, mirroring `family_books`.
  Migration [../supabase/migrations/20260621120000_person_biographies.sql](../supabase/migrations/20260621120000_person_biographies.sql)
  — **applied to remote DB 2026-06-21**.
- **Change detection**: pure `personBiographySignature` in [../lib/bookComposer.ts](../lib/bookComposer.ts)
  — an FNV-1a hash over the person's vitals/identity, their facts (places/occupations/relatives),
  **media count**, and the options that affect prose (style/length/language). Adding info, a
  relative, or a picture flips the signature → that chapter regenerates; everyone else is reused.
- **composeBook** ([../services/books.ts](../services/books.ts)) now loads stored bios once, reuses
  any whose signature still matches (no AI call), regenerates the rest, **persists** the fresh ones
  back to the person, and returns `{ chapters, reusedCount, generatedCount }`. A "Re-write every
  chapter" toggle forces a full rebuild. The Books panel reports "N written by AI, M reused".
- **Profile Story tab** ([../components/person-profile/StoryTab.tsx](../components/person-profile/StoryTab.tsx))
  now reads the stored biography per language (language switcher), shows a "predates recent changes"
  hint when the person was edited after the bio, and has a working **AI Generate / Rewrite** button
  (builds facts from PersonProfile's loaded relations, composes, persists).
- New `personBiographySignature` tests; suite **100 tests**, build green. Degrades gracefully if
  the table is missing (book still generates; just no reuse/persist).
- **Verified live (2026-06-21)** against the migrated DB: Story-tab *AI Generate* on Pernille Gether
  Gamby (Gether-Nielsen) composed a Danish bio and the row persisted to `person_biographies`
  (signature `1shaa0s`, style/length snapshot, `created_by_name=admin`); a full page reload reads the
  stored bio back (button → *AI Rewrite*). RLS read works under the anon key; the upsert RPC writes
  via the public-tree branch of `can_write_tree` (same path as `admin_upsert_family_book`).

---

## 2026-06-21 — Family Books: language option (Danish default)

Books can now be written in **Danish (default)**, Swedish, Norwegian, or English — chosen in the
Book Studio's new Language selector. Threads through the whole pipeline:

- New `lib/bookI18n.ts`: `BOOK_LANGUAGES` (da/sv/no/en) + per-language **book chrome** (cover label,
  "Contents", "N lives", footer), **era labels** (Scandinavian hundreds-form `1800-tallet` vs English
  ordinal `19th century`), and the full **deterministic narrative fragments** so a fallback book is
  also localized — not just the AI path.
- `language` added to `BookGenerationOptions` (default `'da'`); `planBook` localizes
  title/subtitle/overview heading; the AI prompts (`composePersonBiography`/`composeFamilyOverview`)
  instruct the model to "Write entirely in {Language}"; cache keys include language; `BookDocument`
  chrome reads `book.options.language`; `services/books.ts` defaults loaded books to Danish.
- 4 new language tests (Danish title, English title, era-label forms, chrome strings). Suite now
  **98 tests**; build green.

**Why Danish default:** the app imports Danish/Swedish `.ged` trees (Hass-Jensen, Gether-Nielsen),
so a Scandinavian default matches the data. Verified the selector renders Dansk/Svenska/Norsk/English
with Dansk selected.

---

## 2026-06-20 — AI Family Books (narrative generation + PDF export)

Delivered the fourth pillar of the product goal: **AI-written family-history books with PDF
export**, persisted to Supabase. The two AI functions that existed (`generateBio`,
`analyzeHistoricalEra`) were dead code and the profile StoryTab "AI Rewrite" button had no
handler — there was no book/PDF feature at all.

- **Pure planning** — [../lib/bookComposer.ts](../lib/bookComposer.ts): `planBook`,
  `selectPeopleForBook` (scopes: whole tree / descendants-of-proband walk / hand-picked),
  `orderPeopleForBook` (chronological + generation tiebreak), `summarizeFamily` (span, top
  surnames/places/occupations, generation depth), `buildChapterFacts`. Reuses `extractBirthYear`
  from [../lib/lifespan.ts](../lib/lifespan.ts) and mirrors the parental-link direction
  (`personId` = parent, `relatedId` = child) from [../lib/pedigreeScope.ts](../lib/pedigreeScope.ts).
  15 unit tests in [../lib/bookComposer.test.ts](../lib/bookComposer.test.ts).
- **AI composers** — [../services/ai.ts](../services/ai.ts): `composePersonBiography` and
  `composeFamilyOverview`, each OpenRouter-backed with a **deterministic, fact-anchored fallback**
  (`deterministicPersonBiography` / `deterministicFamilyOverview` / `deterministicHistoricalContext`)
  so a full book generates with **no API key**. Single-attempt + 30s timeout (mirrors the
  `parsePlaceString` fail-fast pattern) so a hung free model can't stall generation; concurrency
  capped at 3 in `composeBook`. Biography prompts anchor each life in its **era, region, and
  occupation** and forbid inventing personal facts while welcoming historical context.
- **Orchestration + persistence** — [../services/books.ts](../services/books.ts): `composeBook`
  (plan → per-chapter narratives, progress callback, per-chapter fallback never aborts the book) +
  `saveFamilyBook` / `listFamilyBooks` / `getFamilyBook` / `deleteFamilyBook`.
- **Schema** — [../supabase/migrations/20260620180000_family_books.sql](../supabase/migrations/20260620180000_family_books.sql):
  `family_books` (structured `chapters` jsonb so a future in-UI editor can reopen/edit),
  RLS (`can_read_tree` + `is_public OR can_write_tree`; v1 admin/editor-only since books can weave
  in living-person data), `admin_upsert_family_book` / `admin_delete_family_book` security-definer
  RPCs with audit rows. **Applied to the remote DB via `supabase db push`.**
  Sharp edge hit + fixed: Postgres rejects a non-defaulted param after a defaulted one, so
  `payload_title` got `default ''`.
- **UI** — new **Administrator → Books** tab
  ([../components/admin/BookComposerPanel.tsx](../components/admin/BookComposerPanel.tsx)): scope /
  style / length / title / subtitle config, live progress bar, saved-books list (open / delete).
  Preview + **PDF export** is a portal overlay ([../components/book/BookPrintOverlay.tsx](../components/book/BookPrintOverlay.tsx),
  [../components/book/BookDocument.tsx](../components/book/BookDocument.tsx)) that calls
  `window.print()`; scoped `@media print` rules in [../index.css](../index.css) hide the app chrome
  and page-break per chapter — zero new dependencies, selectable-text PDFs ideal for binding.
- Wired into [../App.tsx](../App.tsx) (admin section) + [../components/admin/AdminSectionTabs.tsx](../components/admin/AdminSectionTabs.tsx).
  Full `npm run build` green (lint + typecheck + **94 tests** + vite build).

**Follow-ups:** in-UI chapter editor (the structured `chapters` jsonb makes this the natural next
step); public sharing (`is_public` flag + viewer route); per-person detail enrichment
(`fetchPersonDetails`) for deeper bios; revive the profile StoryTab "AI Rewrite" button (bio isn't
editable in `PersonProfile` today — needs draft/save plumbing). Concept:
[concepts/ai-family-books.md](concepts/ai-family-books.md).

---

## 2026-06-20 — Fix: ?person= from a different tree now switches the active tree

**Symptom:** refreshing `?person=<uuid>&tree=<other-tree>` showed the person from one tree while
the tree selector stayed on a different tree (e.g. a Hass-Jensen person with Gether-Nielsen
selected) — a profile/tree desync.

**Root cause:** the `pendingPersonId` effect ([../App.tsx](../App.tsx)) loaded the URL person via
`fetchPersonDetails` when they weren't in the active tree, but never switched the active tree to
the person's tree. Then the `[activeTreeId]` cleanup effect (an earlier stale-person fix) cleared
`selectedPerson` on every tree change, so even setting the person before switching got wiped.

**Fix:** the `pendingPersonId` effect now switches `activeTree` to the person's tree when they
differ (the person's tree wins over a stale `?tree=` param), and the `[activeTreeId]` cleanup now
only clears `selectedPerson` when it belongs to a *different* tree than the new active one — so a
person who IS in the newly selected tree survives, while the original stale-person bug stays fixed.
**Verified via agent-browser** on the reported URL: `tree=` resolved to Hass-Jensen and the profile
showed Hermann Anthon Kempen, consistent.

---

## 2026-06-20 — GEDCOM 7.x adaptation (P0 grammar + 7.0-only export)

First implementation increment toward [GEDCOM 7.0 alignment](sources/gedcom7-alignment.md):
**import 5.x and 7.x, export 7.0 only.**

- **New tokenizer** [../lib/gedcomTokenizer.ts](../lib/gedcomTokenizer.ts) (`tokenizeGedcom`):
  strips the UTF-8 BOM, parses the ABNF `Level [Xref] Tag [value]`, **merges `CONT`/`CONC`
  continuation lines into their parent value** (fixes the real bug where long `CONC` notes — e.g.
  the Danish biographies in `myheritage.ged` — were silently dropped), un-escapes `@@`, flags
  `@VOID@`, and detects `HEAD.GEDC.VERS`. [../lib/gedcomParser.ts](../lib/gedcomParser.ts) now
  consumes the tokenizer instead of a per-line regex; `parseGedcom` returns the detected `version`.
- **Standard restriction**: import now reads `RESN` (CONFIDENTIAL/LOCKED/PRIVACY) → `isPrivate`,
  in addition to TNG `_PRIVATE`.
- **Export rewritten to GEDCOM 7.0** (`serializeGedcom`): UTF-8 BOM, `GEDC.VERS 7.0`, a `SCHMA`
  declaration for our `_LIVING` extension, **valid sequential xrefs** (`@I1@`/`@F1@` — the old
  `@P<uuid>@` was invalid since UUID hyphens aren't legal xref chars), per-person `UID` (preserves
  internal id), structured `NAME`/`GIVN`/`SURN` + `MAIDEN`, `SEX` M/F/X/U, `RESN PRIVACY`,
  `_LIVING Y`, `BIRT`/`DEAT`/`BURI` with `DATE`+`PLAC`(+`MAP` coords), upper-cased dates, `CONT`
  for multi-line, `0 TRLR`. Import UI relabeled (5.x + 7.x in, 7.0 out).
- **Verified end-to-end**: exported the real 2148-person Gether-Nielsen tree → valid 7.0
  (`ef bb bf` BOM, `VERS 7.0`, `2 DATE 9 JUL 1903`, 0 `CONC`, valid xrefs). New tokenizer +
  parser + export tests; suite **79 tests / 7 files**, build green.

**Next (still open, see [roadmap.md](roadmap.md) H):** P1 schema spine — structured dates,
`NAME` table + `TYPE`, `SEX` enum→M/F/X/U, event detail, `QUAY`, read `UID`/`EXID` on import; P2
records (`REPO`/`SNOTE`/`OBJE`/`ASSO`). Also: the admin-panel export is empty unless the tree
archive is loaded first (pre-existing; load on demand).

---

## 2026-06-20 — Fix: living/deceased common sense + stuck AI-structure spinner

**TNG `_LIVING` / `_PRIVATE` semantics.** The Hass-Jensen GEDCOM is a [TNG](https://family.nose.dk/)
export. TNG only ever emits `_LIVING Y` (never `_LIVING N`) for people it considers living and
**omits the tag for the deceased** (verified: 743 `_LIVING Y`, 0 `_LIVING N` across the fixtures).
So the parser ([../lib/gedcomParser.ts](../lib/gedcomParser.ts)) now tracks `usesLivingTag` and,
when an export uses `_LIVING`, treats a person **without** `_LIVING Y` as deceased (not the
default "living"). `_PRIVATE Y` → `isPrivate` (absence = public, already correct). 3 new tests.
**Backfill**: the already-imported Hass-Jensen tree had 99 untagged people with `is_living=null`
(TNG ⇒ deceased); a one-time REST `PATCH ... is_living=false WHERE tree_id=Hass-Jensen AND
is_living IS NULL` corrected them (9 `_LIVING Y` preserved). Landing went 72 living/37 passed →
**9 living / 100 passed** (the SQL `tree_statistics` RPC reads `is_living`, so it's now correct).

**Living inference.** A person with a birth year but no recorded death/burial was also shown as
"LIVING" even when implausibly old (e.g. born ABT 1807). Added a pure, tested
[../lib/lifespan.ts](../lib/lifespan.ts) — `inferLivingStatus` / `isImplausiblyOld` (130-year
cap) — and applied it in three places so every surface agrees:
- DB → Person mapper `mapDbPerson` ([../services/archive.ts](../services/archive.ts)) — fixes
  existing records on read (profile, search, pedigree);
- GEDCOM import `finalPeople` ([../lib/gedcomParser.ts](../lib/gedcomParser.ts)) — downgrade-only,
  so new imports persist correctly;
- profile `resolveLivingState` + the search-result card label ([../App.tsx](../App.tsx)).
Verified: Else Cathrine (b. ABT 1807) now reads "Deceased" in both the profile badge and search.

**Stuck AI-structure spinner.** Clicking "AI Structure" on a place spun forever:
`callOpenRouter` used `fetch` with **no timeout**, so a slow/hung OpenRouter request never
settled — `parsePlaceString`'s catch can't fire on a hang, and `handleSmartParse` had no
`finally`. Fixes ([../services/ai.ts](../services/ai.ts), [../components/PlaceInput.tsx](../components/PlaceInput.tsx)):
- `fetchWithTimeout` (AbortController) caps every OpenRouter call (default 30s);
- `parsePlaceString` now fails fast (1 attempt, 15s timeout) → falls back to the deterministic
  place parser instead of hanging;
- `handleSmartParse` wrapped in try/finally so the spinner always clears.
Verified: the button now resolves (~15s worst case) and fills fields from the deterministic parse.

Suite **65 tests / 6 files** (added `lib/lifespan.test.ts`); build green.

**Follow-ups:** the landing "X living / Y passed" counts come from the SQL `tree_statistics` RPC,
which does **not** apply the 130-year rule yet (server-side aggregate — needs a migration). And
OpenRouter appears to hang for the JSON-schema place call on the free model, so every AI place
parse currently hits the 15s timeout before falling back — worth revisiting the model/params.

---

## 2026-06-20 — Fix: stale person carried across tree switch (empty tree + wrong profile)

**Symptom:** after creating a new tree, importing a GEDCOM, and launching the interactive tree,
the pedigree was **empty** and the right-hand profile panel still showed a person from the
*previous* tree.

**Root cause:** the `activeTreeId`-change effect in [../App.tsx](../App.tsx) reset
`pedigreeFocusId`, `allPeople`, etc. but **not `selectedPerson`**. The stale person then (a) kept
the old profile panel open (it renders on `selectedPerson`, App.tsx ~1336), and (b) hijacked the
focus: `focusPersonId = pedigreeFocusId ?? selectedPerson?.id ?? treeDefaultProbandId ??
treePeople[0]?.id` (App.tsx ~445) resolved to a person who isn't in the new tree → empty pedigree
scope. (Data was fine — Hass-Jensen had 109 persons / 180 relationships; it has no
`defaultProbandId`, so focus correctly falls back to `treePeople[0]` once the stale person is
cleared.)

**Fix:** one line — `setSelectedPerson(null)` added to the `[activeTreeId]` effect, so it covers
every switch path (dropdown, `?tree=` URL, tree delete). Verified in-browser: selected Pernille in
Gether-Nielsen, switched to Hass-Jensen → profile panel closes and the pedigree renders (focus
Anne Andersdatter) with parents/descendants.

**Possible follow-up:** GEDCOM import could set a sensible `defaultProbandId` on the new tree so
it opens on a chosen root rather than `treePeople[0]`; and a jsdom/RTL component test would let us
regression-guard App-level tree-switch state (no component-test harness in the repo yet).

---

## 2026-06-20 — Local-dev one-step login + end-to-end DNA badge verification

Added a hostname-gated dev convenience to [../lib/adminAuth.ts](../lib/adminAuth.ts): on
`localhost`/`127.0.0.1`/`*.local` you sign in one-step with **`admin`/`admin`** (or the
`linegra`/`linegra` bootstrap) — the forced reset is skipped, the dev pair is accepted even over
custom stored creds, and a fresh localhost install bootstraps to the `admin` account. Runtime
hostname check, so **deployed builds are unaffected** (real domains keep the forced reset and only
accept stored creds). Removes the friction that blocked automated localhost verification. Verified
in-browser: `admin`/`admin` lands straight in the admin workspace. Docs:
[decisions/local-superadmin-auth.md](decisions/local-superadmin-auth.md),
[runbooks/build-test-deploy.md](runbooks/build-test-deploy.md).

**Verified the roadmap-D DNA badge end-to-end** on localhost (real Supabase data) via
agent-browser: logged in one-step with `linegra/linegra`, opened **Lis (Helene Ingelise) Hass**
→ profile DNA tab, and confirmed the badge renders **"cM prediction: 3rd cousin cluster"** +
green **"Lineage path verified — cM compatible (5 links)"** — exactly matching the admin DNA
panel's "Prediction 3rd cousin cluster / Path linked + cM compatible / 5 relationships" for the
same match (115.5 cM, 7 segments). SPEC §6.3 parity confirmed visually, not just in unit tests.

---

## 2026-06-20 — DNA UX parity on the profile tab (roadmap D)

The profile DNA tab ([../components/person-profile/DNATab.tsx](../components/person-profile/DNATab.tsx))
previously showed only a relationship-link count ("Lineage path verified (N links)"). It now
renders the **same resolved-lineage verdict as the admin DNA panel** — path found + **cM
compatibility** ("cM compatible" / "review cM mismatch" / "no path linked") + cM prediction —
fulfilling SPEC §6.3 parity.

To guarantee the two surfaces can't drift, added a pure `describeSharedLineage(cm, segments,
pathLen)` helper to [../lib/dnaClassification.ts](../lib/dnaClassification.ts) that returns
`{ pathFound, cmCompatible, prediction }`, mirroring the resolver's `pathFitsPrediction` /
`predictionLabel` in `services/archive.ts`. New `SharedLineageStatusBadge` consumes it. Helper is
unit-tested (3 cases: no-path, compatible, mismatch); suite now **57 tests / 5 files**, build green,
app reloaded with no console errors.

**Open follow-ups** (noted in [roadmap.md](roadmap.md) D): surface the human-readable `pathLabel`
(person names) on the profile too (needs name plumbing), and confirm a *mismatched* path persists
`sharedPathRelationshipIds` so the badge survives reload in that case.

---

## 2026-06-20 — GEDCOM export extraction + round-trip tests

Extracted the export serializer out of `handleExportGEDCOM`
([../components/ImportExport.tsx](../components/ImportExport.tsx)) into pure
`serializeGedcom(people, relationships): string` in
[../lib/gedcomParser.ts](../lib/gedcomParser.ts) (output byte-faithful to the old inline
builder; the component keeps only the Blob/anchor download). Parsing and serialization now live
together in one tested module.

Added round-trip tests ([../lib/gedcomParser.test.ts](../lib/gedcomParser.test.ts)): synthetic
`serialize → parse` fidelity (vitals, marriage + parent rels), a second-generation structural
fingerprint check, and a real-fixture `parse → serialize → parse` test (capped to <1.5 MB
fixtures for speed). Suite now **54 tests / 5 files**; full `npm run build` green.

**Learned:** export is lossy + normalizing, so **relationship count is not a round-trip
invariant** (a child of a 2-parent family regains both parent links on import) and ids gain a
`P` prefix. Tests assert person-count + referential integrity, not byte-identity — documented in
[integrations/gedcom.md](integrations/gedcom.md).

---

## 2026-06-20 — Tests in build gate + GEDCOM parser extraction

**Build gate (b):** `npm test` is now wired into `npm run build`
(`lint → typecheck → test → vite build`), so a failing unit test blocks the Vercel deploy.
Docs: [../docs/CICD.md](../docs/CICD.md).

**GEDCOM parser extraction (c):** the ~765-line `parseGEDCOM` closure was lifted out of
[../components/ImportExport.tsx](../components/ImportExport.tsx) (1175 → 365 lines) into a pure,
exported [../lib/gedcomParser.ts](../lib/gedcomParser.ts) (`parseGedcom(text): GedcomParseResult`).
Behavior preserved — extraction was mechanical (the closure was already pure: text in,
`{ people, relationships, warnings }` out). The two GEDCOM tag maps and the `ParsedPerson` type
moved with it. The component now imports `parseGedcom`; GEDCOM export (`handleExportGEDCOM`)
still lives in the component (candidate for a later extraction to enable round-trip tests).

New suite [../lib/gedcomParser.test.ts](../lib/gedcomParser.test.ts): 6 synthetic-record tests
(vitals/places, SEX default, family→marriage+parent rels, `_AKA` alt names, unsupported-tag
warning, empty doc) **plus** a self-skipping smoke test that parses every `*.ged` in the repo
root. **Important:** `*.ged`/`*.csv` are gitignored, so fixture files are absent in CI — the
fixture suite uses `describe.skipIf` and is skipped on Vercel, keeping the gate green. All unit
tests use inline synthetic data. Total suite now **46 tests / 5 files**.

Verified: full `npm run build` green; app reloaded via agent-browser (session `linegra`) with no
console errors.

---

## 2026-06-20 — Test harness + AI fallback/caching (roadmap C & F)

**Roadmap C (test coverage):** added **Vitest** (`npm test` / `test:watch`, `vitest.config.ts`,
Node env). Extracted the pure cM-classification helpers out of the 2.5k-line
[../services/archive.ts](../services/archive.ts) into a testable
[../lib/dnaClassification.ts](../lib/dnaClassification.ts)
(`deriveMatchConfidence`, `supportsRelationshipHops`, `relationshipPredictionLabel`). First
suites cover DNA CSV parsing and classification — **34 tests** across
`lib/dnaRawParser.test.ts`, `lib/dnaClassification.test.ts`, `lib/placeParser.test.ts`,
`lib/aiCache.test.ts`. `lint + typecheck + build` stay green.

**Roadmap F (AI utilities):**
- New deterministic place parser [../lib/placeParser.ts](../lib/placeParser.ts)
  (`deterministicParsePlace` + `mergeStructuredPlace`). `parsePlaceString`
  ([../services/ai.ts](../services/ai.ts)) now backfills from it instead of returning bare
  `{ fullText }` when OpenRouter is unconfigured/fails, and merges AI-over-deterministic when
  AI is available. So place parsing degrades gracefully like cause-of-death already did.
- New bounded LRU [../lib/aiCache.ts](../lib/aiCache.ts) caches `parsePlaceString` and
  `normalizeDeathCause` outputs in-memory (session-scoped) to cut repeat OpenRouter calls on
  re-edits. `normalizeDeathCause` split into a cache wrapper + `computeNormalizedDeathCause`.

**Verified locally**: ran `npm run dev` (Vite :3000) against the real Supabase DB and
screenshotted via agent-browser (session `linegra`) — app boots and renders the Gether-Nielsen
tree cleanly with the changes.

**Still open**: GEDCOM mapping tests — the parser is a ~250-line closure *inside*
[../components/ImportExport.tsx](../components/ImportExport.tsx); extracting it to a pure module
is a real refactor, deferred (see [roadmap.md](roadmap.md) item E).

---

## 2026-06-20 — Wiki created

Established `wiki/` as the LLM-optimized knowledge base, mirroring the structure used by
sibling projects (`polytrader`, `danske-spil`, etc.). Seeded from `SPEC.md`, `AGENT.md`,
`docs/*`, the Supabase migrations, and the existing code paths.

- Documented the six core flows in [architecture.md](architecture.md) and the full data model
  in [schema.md](schema.md).
- Captured standing decisions (RLS model, pedigree-over-force-graph, UUID-first DNA linking,
  OpenRouter, local super-admin auth) under [decisions/](decisions/README.md).
- Surfaced candidate next work in [roadmap.md](roadmap.md).
- **Correction noted while writing**: GEDCOM logic lives in
  [../components/ImportExport.tsx](../components/ImportExport.tsx) +
  `importGedcomToSupabase` in [../services/archive.ts](../services/archive.ts); there is **no**
  `lib/gedcom/` module (the CONTENT_MAP reference is aspirational).

---

## History to date (reconstructed from git)

### 2026-03-28 — AI normalization + media metadata round
- Persist media metadata; extend `source_type` categories (`media_items`, `sources`).
- Cause-of-death normalization: AI prompt + **deterministic fallback** so it degrades without
  a key (`services/ai.ts` `normalizeDeathCause`).
- Centralized admin AI settings (Supabase-backed) and hardened OpenRouter connection test;
  renamed the AI service; fixed AI settings save.
- Editable union/relationship details in the Family tab; fixed UUID serialization for profile
  save payloads.

### 2026-02-11 → 2026-02-13 — DNA shared-autosomal + lineage
- Built the admin DNA panel and shared-autosomal review flow.
- Switched shared-match linking to **UUID-first** (`shared_person_id` /
  `shared_match_person_id`); name-based matching kept only as a token-scored legacy fallback.
- MyHeritage rename + FTDNA import support; multiple lineage-resolution fixes; cM compatibility
  checks; `jsonb_object_length` compat shim.
- Pedigree tree layout iterations; added sibling support to the Family tab; tree-delete
  timeout/performance fixes.

### 2026-02-07 → 2026-02-10 — Foundation
- Unified schema bootstrap: trees, persons, events, relationships, sources, citations, notes,
  media, DNA, audit logs, GEDCOM imports; RLS via `can_read_tree` / `can_write_tree`.
- Admin tree functions, statistics RPC, RLS hardening on profiles and media link policies.

> For exact commits, use `git log --oneline`. This section is a human-readable digest, not a
> changelog of every commit.
