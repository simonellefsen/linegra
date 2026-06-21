# Runbook: DNA import & lineage resolution

Concept: [../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md).
Formats: [../integrations/dna-csv-formats.md](../integrations/dna-csv-formats.md).
Operational guide: [../../docs/DNA_SETUP.md](../../docs/DNA_SETUP.md).

## Import DNA data

1. Open a person's profile → **DNA** tab
   ([../../components/person-profile/DNATab.tsx](../../components/person-profile/DNATab.tsx)).
2. Import either:
   - an **autosomal raw CSV** (header `RSID,CHROMOSOME,POSITION,RESULT`), or
   - a **shared-segment CSV** (MyHeritage or FTDNA comparison format — auto-detected).
3. Parsed rows become `dna_tests` / `dna_matches`. Header order matters; a malformed header is
   rejected with a clear error.

## Resolve shared-match lineage (admin)

1. Open the **DNA admin panel**
   ([../../components/AdminDnaPanel.tsx](../../components/AdminDnaPanel.tsx)).
2. Pick an autosomal tester (`listAutosomalPeopleInTree`); view their shared matches
   (`listSharedMatchesForAutosomalPerson`).
3. Resolve a match: `resolveSharedMatchLineage` / `resolveSharedTestLineage`
   ([../../services/archive.ts](../../services/archive.ts)) find the shortest plausible path and
   store path person ids + path relationship ids + the cM-compatibility outcome.
4. Confirm the DNA-support marker appears on the relationship and is visible in **both** the
   admin panel and the profile DNA tab (SPEC §6.3).

## Interpreting results

- A "compatible" cM result is **supporting evidence, not proof** — ranges overlap between
  relationship types. See [../sources/dna-cm-ranges.md](../sources/dna-cm-ranges.md).
- Linking is **UUID-first**; name matching is a legacy fallback only
  ([../decisions/uuid-first-dna-linking.md](../decisions/uuid-first-dna-linking.md)).

## Troubleshooting

- **Match won't link** — likely missing UUIDs (legacy import). Resolve manually in the admin
  panel rather than forcing a name match.
- **`function does not exist` / jsonb errors** — ensure the latest DNA migrations are applied,
  including the `jsonb_object_length` compat shim
  ([../runbooks/supabase-migrations.md](supabase-migrations.md)).
- **cM looks off vs documented relationship** — surface as low confidence; don't auto-rewrite
  the documented relationship.
