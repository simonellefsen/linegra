# Integration: DNA CSV formats

Parsing lives in [../../lib/dnaRawParser.ts](../../lib/dnaRawParser.ts). Headers are matched
**case-insensitively by position** (the parser upper-cases the header row and checks an
expected prefix), so column order matters. CSV is parsed with a small quote-aware splitter
(`parseCsvLine`) — quoted commas are handled.

## 1. Autosomal raw CSV — `parseAutosomalCsv`

Expected header (exact, positional): `RSID,CHROMOSOME,POSITION,RESULT`. Anything else throws
`Unsupported CSV format`.

| Column | Meaning |
| --- | --- |
| RSID | SNP identifier |
| CHROMOSOME | chromosome |
| POSITION | base-pair position |
| RESULT | genotype call; empty or `--` counts as a **no-call** |

Summary produced: `markersTotal`, `calledMarkers`, `noCallMarkers`, `chromosomeCount`
(+ a 25-row preview). `parseFtdnaAutosomalCsv` is an alias of this parser.

## 2. Shared-segment CSV — `parseSharedSegmentsCsv`

Auto-detects **MyHeritage** vs **FTDNA segment-comparison** by header prefix.

**MyHeritage** header:
`NAME, MATCH NAME, CHROMOSOME, START LOCATION, END LOCATION, START RSID, END RSID, CENTIMORGANS, ...`

**FTDNA** header (no person name / rsid columns):
`MATCH NAME, CHROMOSOME, START LOCATION, END LOCATION, CENTIMORGANS, ...`

Column index mapping the parser uses:

| Field | MyHeritage idx | FTDNA idx |
| --- | --- | --- |
| person name | 0 | — (empty) |
| match name | 1 | 0 |
| chromosome | 2 | 1 |
| start location | 3 | 2 |
| end location | 4 | 3 |
| start rsid | 5 | — |
| end rsid | 6 | — |
| centimorgans | 7 | 4 |
| snps | 8 | 5 |

Rows with non-finite `centimorgans`/`snps` are skipped. The parser accumulates
`totalCentimorgans` and `largestSegmentCentimorgans`. `parseFtdnaSharedSegmentsCsv` is an alias
of this parser.

## Relationship estimate from shared cM

`estimateRelationshipFromSharedCm` buckets total shared cM into a relationship cluster (used as
a hint in the UI). Thresholds (cM ≥): 3400 Parent/Child or Full Sibling · 2200 1st-degree ·
1300 2nd-degree · 680 1st-cousin · 250 2nd-cousin · 90 3rd-cousin · 40 4th-cousin · else
Distant. Full ranges and caveats: [../sources/dna-cm-ranges.md](../sources/dna-cm-ranges.md).

## Sample files (repo root)

- `Shared DNA segments of Pernille Gamby and Lis Stær.csv`
- `Shared DNA segments of Pernille Gamby and James Chauncey IV Franklin.csv`
- `37_P_Gamby_Chrom_Autoso_20260211.csv` (autosomal raw)

## Gotchas

- **Header order is significant** — a re-ordered export will be rejected. Update the expected
  arrays in `dnaRawParser.ts` if a vendor changes its format.
- After parsing, matches are linked **UUID-first** — see
  [../decisions/uuid-first-dna-linking.md](../decisions/uuid-first-dna-linking.md).

Concept: [../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md).
Runbook: [../runbooks/dna-import-and-lineage.md](../runbooks/dna-import-and-lineage.md).
