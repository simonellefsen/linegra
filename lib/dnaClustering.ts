// Pure DNA segment-clustering logic: group shared-segment matches by genomic overlap.
//
// Two matches "triangulate" on a region when each shares an overlapping segment with the kit owner
// on the same chromosome — they likely descend from the same common ancestor for that region.
// Grouping matches by mutual overlap (union-find over overlapping segment pairs) yields clusters
// that approximate shared-grandparent / shared-ancestor groups — the foundation for the Leeds method
// (roadmap K1) and the DNA-painter view (K5). No I/O, no Supabase — fully unit-testable.

export interface ClusterSegment {
  chromosome: string; // '1'..'22', 'X', …
  start: number; // start position (bp or Mb — only needs to be comparable within a chromosome)
  end: number;
  centimorgans?: number;
}

export interface MatchSegments {
  matchId: string;
  segments: ClusterSegment[];
}

export interface ClusterOptions {
  /** Ignore segments shorter than this (cM). Default 0 (keep all). */
  minCentimorgans?: number;
}

/** Two segments on the same chromosome with a positive-length overlap. Touching at a point is NOT overlap. */
export const segmentsOverlap = (a: ClusterSegment, b: ClusterSegment): boolean =>
  a.chromosome === b.chromosome && a.start < b.end && b.start < a.end;

const keepSegment = (seg: ClusterSegment, minCm: number): boolean =>
  (seg.centimorgans ?? 0) >= minCm && seg.end > seg.start;

/**
 * Group matches that mutually share an overlapping segment (triangulation). Two matches are joined
 * when at least one segment of each overlaps a segment of the other (above `minCentimorgans`).
 * Clusters are the connected components — each is a set of matchIds that likely share a common
 * ancestor for some region. Returns clusters (arrays of matchIds), largest first; singletons
 * (matches that overlap nobody) are omitted — callers can infer them as the unmatched set.
 *
 * O(n²·s²) in match count — fine for the match counts in a single tree.
 */
export const clusterSharedSegments = (
  matches: MatchSegments[],
  options: ClusterOptions = {}
): string[][] => {
  const minCm = options.minCentimorgans ?? 0;
  const filtered = matches
    .map((m) => ({ matchId: m.matchId, segments: m.segments.filter((s) => keepSegment(s, minCm)) }))
    .filter((m) => m.segments.length > 0);

  const n = filtered.length;
  const parent = filtered.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const overlap = filtered[i].segments.some((si) =>
        filtered[j].segments.some((sj) => segmentsOverlap(si, sj))
      );
      if (overlap) union(i, j);
    }
  }

  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const arr = groups.get(root) || [];
    arr.push(filtered[i].matchId);
    groups.set(root, arr);
  }
  return Array.from(groups.values())
    .filter((g) => g.length > 1) // omit singletons (no shared overlaps)
    .sort((a, b) => b.length - a.length);
};
