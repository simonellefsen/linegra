# Source: DNA segment triangulation & Leeds clustering (K1)

How Linegra groups shared-segment matches and what the labels mean. See
[../concepts/dna-lineage-verification.md](../concepts/dna-lineage-verification.md) for lineage
resolution; this page covers **overlap clustering** only.

## Inputs

- Per-match segment rows from shared-segment CSV imports (`parseSharedSegmentsCsv` in
  [../../lib/dnaRawParser.ts](../../lib/dnaRawParser.ts)) — chromosome, start, end, cM.
- Documented lineage paths from the tree (parental side + grandparent slots via
  [../../lib/dnaParentalHints.ts](../../lib/dnaParentalHints.ts)).

## Clustering engine

[../../lib/dnaClustering.ts](../../lib/dnaClustering.ts) `clusterSharedSegments`:

1. Filter segments below **min segment cM** (admin default 7).
2. Union-find: join two matches when their owner-side segments overlap on the same chromosome.
3. **Strict ICW (default on):** require ≥50% reciprocal overlap on the shorter segment between
   every pair (`minIcwOverlapFraction: 0.5`). Loose mode uses any positive overlap (legacy).
4. Omit singletons (no overlapping peer).

## Parental-side split (K1)

Unphased autosomal data cannot tell maternal vs paternal chromosome copies. When documented paths
show one match on the **maternal** line and another on the **paternal** line in the same overlap
cluster, `splitClustersByParentalSide` separates them into two Leeds buckets. Unknown-side matches
follow the larger subgroup.

## Leeds labels

Admin **Segment clusters** cards name each group using, in order:

1. **Four-grandparent vote** — majority grandparent slot on resolved paths (`mgf` / `mgm` / `pgf` / `pgm`).
2. **K2 MRCA branch** — highest-scoring MRCA candidate tied to that cluster index.
3. Fallback: `Cluster N`.

## Caveats

- Path-based parental hints are **hints**, not proof of chromosome side.
- ICW overlap on owner-side segments is a **proxy** for true in-common-with between matches; phased
  or trio data would be stronger.
- Clusters suggest shared-ancestor *regions* for research — not confirmed relationships without
  independent evidence.

## Admin surface

[../../components/AdminDnaPanel.tsx](../../components/AdminDnaPanel.tsx) — **Overlap groups
(Leeds-style)** section: strict ICW toggle, min cM, grandparent legend, ICW stats per cluster,
segment painter (K5).
