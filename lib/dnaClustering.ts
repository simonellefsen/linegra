// Pure DNA segment-clustering logic: group shared-segment matches by genomic overlap.
//
// Two matches "triangulate" on a region when each shares an overlapping segment with the kit owner
// on the same chromosome — they likely descend from the same common ancestor for that region.
// Grouping matches by mutual overlap (union-find over overlapping segment pairs) yields clusters
// that approximate shared-grandparent / shared-ancestor groups — the foundation for the Leeds method
// (roadmap K1) and the DNA-painter view (K5). No I/O, no Supabase — fully unit-testable.

import type { DNASharedSegmentRowPreview } from '../types';

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
  /**
   * Minimum reciprocal overlap between owner-side segment pairs to treat two matches as ICW-linked.
   * 0 keeps the legacy rule (any positive overlap on the same chromosome). 0.5+ is stricter.
   */
  minIcwOverlapFraction?: number;
}

export interface SegmentOverlapDetail {
  chromosome: string;
  start: number;
  end: number;
  overlapBp: number;
  /** Overlap length divided by the shorter segment length (0–1). */
  overlapFraction: number;
  /** cM estimate from the shorter segment, scaled by overlap fraction. */
  overlapCentimorgans: number;
}

/** Positive-length intersection of two segments on the same chromosome, or null. */
export const segmentIntersection = (a: ClusterSegment, b: ClusterSegment): SegmentOverlapDetail | null => {
  if (a.chromosome !== b.chromosome) return null;
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (end <= start) return null;
  const overlapBp = end - start;
  const lenA = a.end - a.start;
  const lenB = b.end - b.start;
  const minLen = Math.min(lenA, lenB);
  const overlapFraction = minLen > 0 ? overlapBp / minLen : 0;
  const cmA = a.centimorgans ?? 0;
  const cmB = b.centimorgans ?? 0;
  const shorterCm = Math.min(cmA, cmB);
  const overlapCentimorgans = minLen > 0 ? shorterCm * (overlapBp / minLen) : 0;
  return { chromosome: a.chromosome, start, end, overlapBp, overlapFraction, overlapCentimorgans };
};

/** Strongest owner-side segment intersection between two matches (proxy for in-common-with). */
export const bestOwnerSideIcw = (
  segmentsA: ClusterSegment[],
  segmentsB: ClusterSegment[]
): SegmentOverlapDetail | null => {
  let best: SegmentOverlapDetail | null = null;
  for (const a of segmentsA) {
    for (const b of segmentsB) {
      const detail = segmentIntersection(a, b);
      if (!detail) continue;
      if (!best || detail.overlapFraction > best.overlapFraction) best = detail;
    }
  }
  return best;
};

const matchesClusterPair = (
  segmentsA: ClusterSegment[],
  segmentsB: ClusterSegment[],
  minIcwOverlapFraction: number
): boolean => {
  if (minIcwOverlapFraction > 0) {
    const icw = bestOwnerSideIcw(segmentsA, segmentsB);
    return !!icw && icw.overlapFraction >= minIcwOverlapFraction;
  }
  return segmentsA.some((si) => segmentsB.some((sj) => segmentsOverlap(si, sj)));
};

export interface ClusterIcwSummary {
  matchIds: string[];
  /** Mean best pairwise ICW fraction across all pairs in the cluster. */
  avgIcwFraction: number;
  /** Pairs meeting `minIcwOverlapFraction` when strict ICW is enabled. */
  icwConfirmedPairs: number;
  totalPairs: number;
}

/** Summarize ICW strength for a cluster of match ids. */
export const summarizeClusterIcw = (
  matchIds: string[],
  segmentsByMatchId: Map<string, ClusterSegment[]>,
  minIcwOverlapFraction = 0
): ClusterIcwSummary => {
  let fractionSum = 0;
  let icwConfirmedPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < matchIds.length; i += 1) {
    for (let j = i + 1; j < matchIds.length; j += 1) {
      const segsA = segmentsByMatchId.get(matchIds[i]) || [];
      const segsB = segmentsByMatchId.get(matchIds[j]) || [];
      const icw = bestOwnerSideIcw(segsA, segsB);
      totalPairs += 1;
      if (icw) {
        fractionSum += icw.overlapFraction;
        if (icw.overlapFraction >= minIcwOverlapFraction) icwConfirmedPairs += 1;
      }
    }
  }
  return {
    matchIds,
    avgIcwFraction: totalPairs > 0 ? fractionSum / totalPairs : 0,
    icwConfirmedPairs,
    totalPairs,
  };
};

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
  const minIcw = options.minIcwOverlapFraction ?? 0;
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
      if (matchesClusterPair(filtered[i].segments, filtered[j].segments, minIcw)) union(i, j);
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

export const segmentsFromPreview = (preview: DNASharedSegmentRowPreview[]): ClusterSegment[] =>
  preview.map((row) => ({
    chromosome: String(row.chromosome),
    start: row.startLocation,
    end: row.endLocation,
    centimorgans: row.centimorgans,
  }));
