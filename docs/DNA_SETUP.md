# DNA Setup & Workflow

This document covers Linegra's current DNA model and the expected workflow for
Autosomal and Shared Autosomal imports.

## 1. Current DNA data model

Primary tables:

- `public.dna_tests`
  - one row per test record attached to a person profile
  - supports `Autosomal`, `Shared Autosomal`, `Y-DNA`, `mtDNA`, `X-DNA`, `Other`
  - shared-match linking now uses UUID columns:
    - `shared_person_id` (tester in-tree person id)
    - `shared_match_person_id` (match in-tree person id)
- `public.dna_matches`
  - derived link records used by lineage resolution and relationship support
  - stores shared cM, segment count, confidence, path metadata
- `public.relationships`
  - path support is written into relationship metadata (`dna_support_by_person`)

## 2. Supported imports in PersonProfile > DNA tab

### Autosomal raw CSV
- Import action: `Import FTDNA Raw CSV`
- Parser: `lib/dnaRawParser.ts` (`parseAutosomalCsv`)
- Stores marker-level summary + preview in DNA test metadata.

### Shared segments CSV
- Import action: `Import Shared DNA CSV`
- Parser: `lib/dnaRawParser.ts` (`parseSharedSegmentsCsv`)
- Supported formats:
  - MyHeritage shared segment export
  - FTDNA segment-comparison export (`Match Name, Chromosome, Start Location...`)
- Stores segment summary, preview, inferred cM confidence, and prediction label.

## 3. Shared Autosomal linking behavior

Linegra now resolves shared matches with UUID-first semantics:

1. Use `shared_person_id` / `shared_match_person_id` when present.
2. Use metadata UUID fields for legacy rows.
3. Fall back to normalized name matching only for historical imports lacking IDs.

This keeps current imports stable even if display names change.

## 4. Administrator DNA panel workflow

Location: `Administrator > DNA`.

Flow:

1. Select an Autosomal tester.
2. Review shared autosomal matches in-tree.
3. Click `Resolve lineage` per match.
4. Resolver finds a shortest family path and checks cM compatibility.
5. Compatible paths are written back to:
   - `dna_matches.metadata` (path ids + label)
   - `dna_tests.metadata` for shared-test sourced rows
   - `relationships.metadata.dna_support_by_person`

The panel displays:
- shared cM, segments, largest segment
- confidence and prediction cluster
- path status (`Path linked + cM compatible`, mismatch warning, or no path)

## 5. UI propagation

- `components/AdminDnaPanel.tsx` resolves and reports lineage.
- `components/person-profile/DNATab.tsx` listens for the `linegra:dna-lineage-resolved`
  event and updates the corresponding test card in the profile UI.
- `components/InteractiveTree/PedigreeTree.tsx` renders DNA support badges based on
  relationship metadata.

## 6. Required migrations

The following migration families must be applied on the target Supabase project:

- `20260211100000_dna_shared_autosomal.sql`
- `20260211223000_dna_match_lineage_support.sql`
- `20260212170000_admin_list_tree_shared_autosomal_tests.sql`
- `20260212190000_dna_shared_ids.sql`
- `20260212193000_dna_shared_ids_backfill.sql`

If RPC shape changes, redeploy and ensure schema cache is refreshed before testing.

## 7. Known operational guidance

- Shared-match imports should include or resolve a stable in-tree person UUID where possible.
- For legacy files without IDs, verify counterpart mapping in Admin DNA panel before
  trusting lineage outcomes.
- For large trees, run lineage from the admin panel rather than profile-by-profile to keep
  review centralized.
