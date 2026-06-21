# Decision: UUID-first DNA match linking

**Decision.** Shared DNA matches are linked to people by **UUID first**
(`shared_person_id` / `shared_match_person_id`), with a metadata-UUID fallback, and **name
matching only as a legacy fallback** for historical rows that lack IDs.

## Why

- **Names are ambiguous and lossy.** Genealogy data is full of repeated names, maiden/married
  variants, and transliterations. Early name-based matching produced wrong lineage links.
- **Stability.** UUIDs survive renames, merges, and re-imports; a relationship's DNA-support
  annotation stays attached to the right people.
- This was learned the hard way — see the Feb 2026 DNA fix sequence in [../log.md](../log.md)
  ("use uuid", "use uuid when comparing", repeated FTDNA lineage fixes).

## How it works

- Importers stamp UUIDs onto `dna_matches` rows where known.
- `resolveSharedMatchLineage` / `resolveSharedTestLineage`
  ([../../services/archive.ts](../../services/archive.ts)) resolve paths by id.
- Name matching, when used, is **token-scored** (not exact-string) and is the last resort.

## Alternatives rejected

- **Name-as-primary key** — the original approach; caused mis-links, now legacy-only.
- **Vendor match-id as primary** — not portable across MyHeritage/FTDNA exports.

## Consequences / rules

- **Do not regress** new code to name matching. If a match can't be linked by UUID, surface it
  for admin resolution rather than guessing.
- Keep column mapping for vendor formats current in
  [../integrations/dna-csv-formats.md](../integrations/dna-csv-formats.md).

Related: [../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md).
