import { describe, it, expect } from 'vitest';
import {
  segmentsOverlap,
  clusterSharedSegments,
  ClusterSegment,
  MatchSegments,
} from './dnaClustering';

const seg = (chromosome: string, start: number, end: number, centimorgans = 20): ClusterSegment => ({
  chromosome,
  start,
  end,
  centimorgans,
});

const match = (matchId: string, segments: ClusterSegment[]): MatchSegments => ({ matchId, segments });

describe('segmentsOverlap', () => {
  it('is true for a positive-length overlap on the same chromosome', () => {
    expect(segmentsOverlap(seg('1', 100, 200), seg('1', 150, 250))).toBe(true);
  });
  it('is true when one segment contains the other', () => {
    expect(segmentsOverlap(seg('1', 100, 300), seg('1', 150, 200))).toBe(true);
  });
  it('is false when segments only touch at a point', () => {
    expect(segmentsOverlap(seg('1', 100, 200), seg('1', 200, 300))).toBe(false);
  });
  it('is false for different chromosomes', () => {
    expect(segmentsOverlap(seg('1', 100, 200), seg('2', 150, 250))).toBe(false);
  });
});

describe('clusterSharedSegments', () => {
  it('returns no clusters when there are no matches', () => {
    expect(clusterSharedSegments([])).toEqual([]);
  });

  it('groups two matches that share an overlapping segment', () => {
    const clusters = clusterSharedSegments([
      match('A', [seg('1', 100, 200)]),
      match('B', [seg('1', 150, 250)]),
    ]);
    expect(clusters).toEqual([['A', 'B']]);
  });

  it('omits singletons (matches that overlap nobody)', () => {
    const clusters = clusterSharedSegments([
      match('A', [seg('1', 100, 200)]),
      match('B', [seg('3', 100, 200)]), // different chromosome → no overlap
    ]);
    expect(clusters).toEqual([]);
  });

  it('clusters transitively: A↔B and B↔C group A,B,C even if A↔C do not overlap', () => {
    const clusters = clusterSharedSegments([
      match('A', [seg('1', 100, 200)]),
      match('B', [seg('1', 150, 250), seg('5', 100, 200)]),
      match('C', [seg('5', 150, 250)]), // overlaps B on chr5, not A
    ]);
    expect(clusters).toEqual([['A', 'B', 'C']]);
  });

  it('keeps overlapping pairs in separate clusters when they share no region', () => {
    const clusters = clusterSharedSegments([
      match('A', [seg('1', 100, 200)]),
      match('B', [seg('1', 150, 250)]),
      match('C', [seg('9', 100, 200)]),
      match('D', [seg('9', 150, 250)]),
    ]);
    expect(clusters).toContainEqual(['A', 'B']);
    expect(clusters).toContainEqual(['C', 'D']);
    expect(clusters).toHaveLength(2);
  });

  it('respects minCentimorgans: a match whose only segment is too short does not cluster', () => {
    const clusters = clusterSharedSegments(
      [
        match('A', [seg('1', 100, 200, 5)]), // below the 7 cM threshold
        match('B', [seg('1', 150, 250, 30)]),
      ],
      { minCentimorgans: 7 }
    );
    // A's only segment is filtered out → A has no segments → no cluster.
    expect(clusters).toEqual([]);
  });

  it('sorts clusters largest first', () => {
    const clusters = clusterSharedSegments([
      match('A', [seg('1', 100, 200)]),
      match('B', [seg('1', 150, 250)]),
      match('C', [seg('7', 0, 100)]),
      match('D', [seg('7', 50, 150)]),
      match('E', [seg('7', 120, 220)]),
    ]);
    // {C,D,E} (3) should come before {A,B} (2).
    expect(clusters[0]).toHaveLength(3);
    expect(clusters[1]).toHaveLength(2);
  });
});
