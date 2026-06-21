# Concept: DNA lineage verification

Linegra uses autosomal DNA evidence to **corroborate documented relationships**. The goal is
not to infer a tree from DNA, but to check that a documented lineage path between two testers
is consistent with how much DNA they actually share.

## The pipeline (see [../architecture.md](../architecture.md#5-dna-lineage-pipeline))

1. **Ingest** — import an autosomal raw CSV and/or shared-segment CSV (MyHeritage or FTDNA
   comparison format) via [../../lib/dnaRawParser.ts](../../lib/dnaRawParser.ts)
   (`parseAutosomalCsv`, `parseSharedSegmentsCsv`; FTDNA aliases reuse the same parsers).
   Rows become `dna_tests` and `dna_matches` ([../schema.md](../schema.md)).
2. **Link (UUID-first)** — matches are tied to people by UUID
   (`shared_person_id` / `shared_match_person_id`), with a metadata-UUID fallback, and a
   token-scored **name** match only for legacy rows lacking IDs. See
   [../decisions/uuid-first-dna-linking.md](../decisions/uuid-first-dna-linking.md).
3. **Resolve lineage** — the admin DNA panel finds the shortest plausible relationship path
   between the two testers: `resolveSharedMatchLineage` / `resolveSharedTestLineage` in
   [../../services/archive.ts](../../services/archive.ts).
4. **cM compatibility** — compare observed shared centimorgans against the expected range for
   the resolved relationship (see [../sources/dna-cm-ranges.md](../sources/dna-cm-ranges.md)).
   The result stores path person ids, path relationship ids, and the compatibility outcome.
5. **Annotate** — relationship metadata gets a DNA-support marker; resolved status is
   visible in **both** the admin DNA panel and the profile DNA tab (SPEC §6.3). Both surfaces
   derive the verdict from the same tested helper `describeSharedLineage`
   ([../../lib/dnaClassification.ts](../../lib/dnaClassification.ts)) so they cannot drift: it
   returns `{ pathFound, cmCompatible, prediction }` from total cM, segment count, and the
   resolved path length — exactly mirroring the resolver's `pathFitsPrediction` /
   `predictionLabel` in `services/archive.ts`.

## Key terms

- **Autosomal**: inherited from both parents; useful out to ~3rd–4th cousins.
- **Shared cM (centimorgans)**: total length of matching segments; roughly proportional to
  relatedness, but ranges overlap between relationship types — hence "compatible," not "proves."
- **Shared match**: a third person who matches both testers, used to triangulate.

## Files

- Parsing: [../../lib/dnaRawParser.ts](../../lib/dnaRawParser.ts)
- Admin review: [../../components/AdminDnaPanel.tsx](../../components/AdminDnaPanel.tsx)
- Profile surface: [../../components/person-profile/DNATab.tsx](../../components/person-profile/DNATab.tsx)
- Resolvers + queries: [../../services/archive.ts](../../services/archive.ts)
  (`listAutosomalPeopleInTree`, `listSharedMatchesForAutosomalPerson`, `resolveShared*Lineage`)
- Operational guide: [../../docs/DNA_SETUP.md](../../docs/DNA_SETUP.md),
  [../runbooks/dna-import-and-lineage.md](../runbooks/dna-import-and-lineage.md)

## Gotchas

- **Always link by UUID.** Name matching is a legacy crutch and is lossy; do not regress to it.
- cM ranges **overlap** — a "compatible" result is supporting evidence, not proof. Surface
  confidence, not certainty.
- Keep the FTDNA/MyHeritage column-mapping in sync with
  [../integrations/dna-csv-formats.md](../integrations/dna-csv-formats.md).
