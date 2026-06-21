# Source: Shared-cM relationship ranges

Reference for interpreting autosomal **shared centimorgans (cM)** against relationship type.
Used by lineage resolution to judge whether observed sharing is **compatible** with a
documented relationship. See
[../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md).

> **Caveat first:** cM ranges **overlap heavily** between relationship types. A value in range
> is *supporting evidence*, never proof. The authoritative public reference for full
> distributions is the **Shared cM Project** (DNA Painter). The buckets below are the coarse
> clusters Linegra currently uses as hints — not a replacement for the full ranges.

## Linegra's bucket thresholds (`estimateRelationshipFromSharedCm`)

From [../../lib/dnaRawParser.ts](../../lib/dnaRawParser.ts) — total shared cM ≥:

| Threshold (cM) | Cluster label |
| --- | --- |
| 3400 | Parent/Child or Full Sibling |
| 2200 | 1st-degree cluster |
| 1300 | 2nd-degree cluster |
| 680 | 1st-cousin cluster |
| 250 | 2nd-cousin cluster |
| 90 | 3rd-cousin cluster |
| 40 | 4th-cousin cluster |
| < 40 | Distant cousin cluster |

## Rough orientation (typical averages, not bounds)

| Relationship | Approx. shared cM |
| --- | --- |
| Parent / child | ~3400 |
| Full sibling | ~2550 |
| Grandparent / aunt / uncle / half-sibling | ~1700 |
| 1st cousin | ~850 |
| 1st cousin once removed | ~430 |
| 2nd cousin | ~230 |
| 3rd cousin | ~90 |
| 4th cousin | ~35 |

(Totals are ~6800 cM for a full genome; a child shares ~50% with each parent.)

## Compatibility verdict (path length vs cM)

Separately from the cluster labels above, lineage resolution checks whether a *resolved path's
length* is plausible for the observed cM, via `supportsRelationshipHops(cm, hops)` in
[../../lib/dnaClassification.ts](../../lib/dnaClassification.ts). Higher cM ⇒ fewer hops allowed:

| Shared cM ≥ | Max plausible relationship hops |
| --- | --- |
| 1300 | 4 |
| 680 | 6 |
| 200 | 8 |
| 90 | 10 |
| 40 | 12 |
| < 40 (and > 0) | 16 |

Both the admin DNA panel and the profile DNA tab render the resulting "cM compatible" vs
"review cM mismatch" verdict through the shared `describeSharedLineage` helper.

## How to use this

- Treat the bucket as a **hint**, then check the *documented* path's expected range.
- Below ~40 cM, segments are increasingly likely to be identical-by-chance — weight low.
- When updating thresholds, change them in `lib/dnaRawParser.ts` (cluster labels) /
  `lib/dnaClassification.ts` (prediction + hop limits) **and** here, and note it in
  [../log.md](../log.md).
