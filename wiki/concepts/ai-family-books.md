# AI Family Books

Linegra can compose an AI-written, narrative **family-history book** from a tree and export it to
PDF — the fourth pillar of the product goal alongside GEDCOM 7.x and DNA. This page captures the
concept and the design choices that matter.

## What it is

From **Administrator → Books**, an admin picks a scope (whole tree / one descendant branch /
hand-picked people), a style (narrative / concise / scholarly), a length, and a **language**
(Danish default, plus Swedish, Norwegian, English). Linegra plans the book, writes each chapter,
saves it to Supabase, and renders a print-optimized preview whose **Export PDF** button calls
`window.print()` (Save as PDF).

**Languages** are localized end-to-end via `lib/bookI18n.ts`: the model is instructed to write in
the chosen language, and the deterministic fallbacks (for when there's no API key) plus all book
chrome (cover, contents, era labels — Scandinavian `1800-tallet` form vs English `19th century`)
are translated too, so a Danish-default book stays Danish even without a key.

Each person chapter weaves the individual's facts together with **historical context for the era,
region, and occupation they lived in** — the events and social changes a person of that place and
time would plausibly have experienced. The AI is steered to anchor on documented personal facts and
to frame historical context as context, not as invented personal record.

## Why these choices

- **Persisted, not ephemeral.** Books are saved in `family_books` with structured `chapters` jsonb
  (`[{kind, title, personId?, narrative, facts?}]`). The user's stated intent is a future in-UI
  book editor; persisting structured chapters (facts separate from narrative) makes
  reopen/edit/regenerate-one-chapter the natural next step, rather than re-running the whole thing.
- **Native print-to-PDF, zero dependencies.** A print-stylesheet + `window.print()` yields real,
  selectable-text PDFs with correct page breaks and duplex options — ideal for binding — without
  adding a PDF library or fighting HTML→PDF pagination. The preview overlay (`.book-print-root`)
  is the only visible subtree under `@media print`; the app chrome and toolbar (`.no-print`) are
  hidden.
- **Deterministic fallback per chapter.** Every AI composer has a fact-anchored deterministic
  builder, so a full book generates **with no OpenRouter key**, and a single hung/slow call falls
  back instead of aborting the book. Composers are single-attempt + 30s timeout (the same fail-fast
  pattern as place parsing), and `composeBook` caps concurrency at 3 to avoid rate-limiting.
- **Privacy by default.** A book can weave in living-person context, so v1 visibility is
  admin/editor-only: `can_read_tree(tree) AND (is_public OR can_write_tree(tree))` with
  `is_public` defaulting false. The `is_public` flag is the forward path to public sharing once a
  viewer route exists.

## Where the pieces live

- Pure planning: [../../lib/bookComposer.ts](../../lib/bookComposer.ts) (reuses
  [../../lib/lifespan.ts](../../lib/lifespan.ts) year extraction; mirrors parental-link direction
  from [../../lib/pedigreeScope.ts](../../lib/pedigreeScope.ts)).
- AI composers + fallbacks: [../../services/ai.ts](../../services/ai.ts).
- Orchestration + persistence: [../../services/books.ts](../../services/books.ts).
- UI: [../../components/admin/BookComposerPanel.tsx](../../components/admin/BookComposerPanel.tsx),
  [../../components/book/](../../components/book/), print CSS in [../../index.css](../../index.css).
- Schema: [`20260620180000_family_books.sql`](../../supabase/migrations/20260620180000_family_books.sql).

See [../architecture.md](../architecture.md) flow 7 for the end-to-end diagram and
[../log.md](../log.md) for the build record.

## Honesty rules: partner unions and the living

Two correctness rules the composers enforce, both motivated by real chapters:

- **Partners are not spouses.** A `partner` union (a couple that lived together but never married) is
  distinct from a `marriage`, and biographies are worded accordingly — `BookChapterFacts.partnerNames`
  drives a "lived together as an unmarried couple" phrase, never "married". GEDCOM 7.x has no
  dedicated partner-union type, so the kind is set on the relationship (Family → Edit Union → Union
  Type) and stored via `admin_update_relationship_details.payload_union_type`. It also **round-trips
  through GEDCOM**: a `MARR.TYPE` of COMMON LAW / PARTNERS / cohabit / sambo… imports as `partner`
  (`deriveUnionType`), and a `partner` union exports as a `FAM` with `2 TYPE COMMON LAW`
  (`lib/gedcomParser.ts`).
- **Never write about death for the living.** The death section is gated on `inferLivingStatus`
  (`lib/lifespan.ts`): a still-living subject gets no death mention; the "circumstances of death are
  not recorded" sentence appears only for someone presumed deceased (recorded death/burial, or a birth
  year beyond a plausible lifespan). The AI prompt carries matching living/deceased guidance.

## Open follow-ups

- In-UI chapter editor (edit / regenerate individual chapters).
- Public sharing of a saved book (`is_public` + a public viewer route).
- Per-person detail enrichment via `fetchPersonDetails` (events, notes) for deeper bios.
- The Books panel (like the GEDCOM panel) needs the tree archive loaded first — consider loading
  `allPeople` on tree selection so admin panels work without first visiting Interactive Tree.

## Per-person biographies + incremental composition (2026-06-21)

Biographies are no longer thrown away after each book build. Each person's life story is
**persisted per language** in `person_biographies` (see [../schema.md](../schema.md)), surfaced on
the profile **Story tab**, and books are **compiled from these** rather than re-generating every
chapter.

- **Signature-based change detection**: `personBiographySignature(person, facts, options)` (pure,
  in [../../lib/bookComposer.ts](../../lib/bookComposer.ts)) hashes everything a biography derives
  from — vitals, identity, facts (places/occupations/relatives), media count, and style/length/
  language. A stored bio is **reused** while its signature matches; it's regenerated when the
  person changes (new info, relative, or picture) or the options change.
- `composeBook` reuses unchanged bios (no AI call), regenerates only the changed/missing ones, and
  **persists** the fresh ones back to the person. Returns `{ chapters, reusedCount, generatedCount }`;
  a "Re-write every chapter" toggle forces a full rebuild.
- The **Story tab** ([../../components/person-profile/StoryTab.tsx](../../components/person-profile/StoryTab.tsx))
  reads the stored bio per language, flags "predates recent changes", and has a working AI
  Generate/Rewrite button (single-person, builds facts from the profile's loaded relations).
- Resource-saving core: large trees re-run the AI only for the handful of people who changed.
