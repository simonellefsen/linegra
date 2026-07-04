import { describe, expect, it } from 'vitest';
import {
  buildChromosomePaintModel,
  compareChromosomes,
  paintStyleForCluster,
  type PaintSegmentInput,
} from './dnaSegmentPainter';
import type { ClusterSegment } from './dnaClustering';

const seg = (chromosome: string, start: number, end: number, centimorgans = 12): ClusterSegment => ({
  chromosome,
  start,
  end,
  centimorgans,
});

const input = (
  matchId: string,
  segments: ClusterSegment[],
  clusterIndex: number | null = null
): PaintSegmentInput => ({
  matchId,
  matchLabel: matchId,
  clusterIndex,
  segments,
});

describe('compareChromosomes', () => {
  it('orders numeric chromosomes before sex chromosomes', () => {
    expect(compareChromosomes('1', '22')).toBeLessThan(0);
    expect(compareChromosomes('22', 'X')).toBeLessThan(0);
    expect(compareChromosomes('X', 'Y')).toBeLessThan(0);
    expect(compareChromosomes('Y', 'MT')).toBeLessThan(0);
  });
});

describe('buildChromosomePaintModel', () => {
  it('returns empty when no segments pass the min-cM filter', () => {
    const rows = buildChromosomePaintModel(
      [input('A', [seg('1', 1000, 2000, 3)])],
      { minCentimorgans: 7 }
    );
    expect(rows).toEqual([]);
  });

  it('positions a segment proportionally on its chromosome track', () => {
    const rows = buildChromosomePaintModel([input('A', [seg('3', 1000, 3000, 20)])]);
    expect(rows).toHaveLength(1);
    expect(rows[0].chromosome).toBe('3');
    expect(rows[0].maxPosition).toBe(3000);
    const painted = rows[0].segments[0];
    expect(painted.leftFraction).toBeCloseTo(1000 / 3000);
    expect(painted.widthFraction).toBeCloseTo(2000 / 3000);
    expect(painted.lane).toBe(0);
  });

  it('stacks overlapping segments into separate lanes', () => {
    const rows = buildChromosomePaintModel([
      input('A', [seg('1', 1000, 5000, 20)]),
      input('B', [seg('1', 2000, 6000, 18)]),
    ]);
    expect(rows[0].laneCount).toBe(2);
    const lanes = rows[0].segments.map((s) => s.lane).sort();
    expect(lanes).toEqual([0, 1]);
  });

  it('sorts chromosomes numerically', () => {
    const rows = buildChromosomePaintModel([
      input('A', [seg('10', 1, 100, 10)]),
      input('B', [seg('2', 1, 100, 10)]),
    ]);
    expect(rows.map((row) => row.chromosome)).toEqual(['2', '10']);
  });
});

describe('paintStyleForCluster', () => {
  it('returns unclustered style for null', () => {
    expect(paintStyleForCluster(null).fill).toContain('slate');
  });

  it('cycles cluster palette', () => {
    expect(paintStyleForCluster(0).fill).not.toBe(paintStyleForCluster(1).fill);
  });
});
