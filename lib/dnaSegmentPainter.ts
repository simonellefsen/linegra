// DNA-painter-style chromosome map: position shared segments on per-chromosome tracks with lane
// stacking for overlaps. Pure logic (roadmap K5) — reusable from admin panel and profile DNA tab.

import type { ClusterSegment } from './dnaClustering';

export interface PaintSegmentInput {
  matchId: string;
  matchLabel: string;
  /** Cluster index from K1 grouping, or null when the match is unclustered. */
  clusterIndex: number | null;
  segments: ClusterSegment[];
}

export interface PaintedSegment {
  matchId: string;
  matchLabel: string;
  clusterIndex: number | null;
  chromosome: string;
  start: number;
  end: number;
  centimorgans: number;
  lane: number;
  /** Fraction of chromosome width where the segment starts (0–1). */
  leftFraction: number;
  /** Fraction of chromosome width the segment spans (0–1). */
  widthFraction: number;
}

export interface ChromosomePaintRow {
  chromosome: string;
  maxPosition: number;
  laneCount: number;
  segments: PaintedSegment[];
}

export interface SegmentPainterOptions {
  /** Drop segments shorter than this (cM). Default 0. */
  minCentimorgans?: number;
}

const CHROMOSOME_RANK: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  '11': 11,
  '12': 12,
  '13': 13,
  '14': 14,
  '15': 15,
  '16': 16,
  '17': 17,
  '18': 18,
  '19': 19,
  '20': 20,
  '21': 21,
  '22': 22,
  X: 23,
  Y: 24,
  MT: 25,
};

/** Sort chromosomes 1–22, then X, Y, MT; unknown labels fall to the end alphabetically. */
export const compareChromosomes = (a: string, b: string): number => {
  const ra = CHROMOSOME_RANK[a.toUpperCase()] ?? 100;
  const rb = CHROMOSOME_RANK[b.toUpperCase()] ?? 100;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
};

const keepSegment = (seg: ClusterSegment, minCm: number): boolean =>
  seg.end > seg.start && (seg.centimorgans ?? 0) >= minCm;

/** Greedy lane assignment so overlapping segments stack vertically. */
const assignLanes = (segments: PaintedSegment[]): number => {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  for (const seg of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > seg.start) lane += 1;
    seg.lane = lane;
    laneEnds[lane] = seg.end;
  }
  return laneEnds.length;
};

/**
 * Build per-chromosome paint rows from match segment inputs. Segments are scaled to each
 * chromosome's observed max end coordinate and stacked into lanes when they overlap.
 */
export const buildChromosomePaintModel = (
  inputs: PaintSegmentInput[],
  options: SegmentPainterOptions = {}
): ChromosomePaintRow[] => {
  const minCm = options.minCentimorgans ?? 0;
  const byChromosome = new Map<string, PaintedSegment[]>();
  const maxByChromosome = new Map<string, number>();

  inputs.forEach((input) => {
    input.segments.filter((seg) => keepSegment(seg, minCm)).forEach((seg) => {
      const chromosome = String(seg.chromosome);
      const painted: PaintedSegment = {
        matchId: input.matchId,
        matchLabel: input.matchLabel,
        clusterIndex: input.clusterIndex,
        chromosome,
        start: seg.start,
        end: seg.end,
        centimorgans: seg.centimorgans ?? 0,
        lane: 0,
        leftFraction: 0,
        widthFraction: 0,
      };
      const list = byChromosome.get(chromosome) || [];
      list.push(painted);
      byChromosome.set(chromosome, list);
      maxByChromosome.set(chromosome, Math.max(maxByChromosome.get(chromosome) ?? 0, seg.end));
    });
  });

  const rows: ChromosomePaintRow[] = [];
  for (const [chromosome, segments] of byChromosome.entries()) {
    const maxPosition = Math.max(maxByChromosome.get(chromosome) ?? 1, 1);
    segments.forEach((seg) => {
      seg.leftFraction = seg.start / maxPosition;
      seg.widthFraction = Math.max((seg.end - seg.start) / maxPosition, 0.002);
    });
    const laneCount = assignLanes(segments);
    rows.push({ chromosome, maxPosition, laneCount, segments });
  }

  return rows.sort((a, b) => compareChromosomes(a.chromosome, b.chromosome));
};

/** Tailwind-friendly fill/border pairs aligned with admin cluster card tints. */
export const CLUSTER_PAINT_STYLES = [
  { fill: 'bg-violet-400/80', border: 'border-violet-500', hover: 'hover:bg-violet-500' },
  { fill: 'bg-sky-400/80', border: 'border-sky-500', hover: 'hover:bg-sky-500' },
  { fill: 'bg-amber-400/80', border: 'border-amber-500', hover: 'hover:bg-amber-500' },
  { fill: 'bg-rose-400/80', border: 'border-rose-500', hover: 'hover:bg-rose-500' },
  { fill: 'bg-emerald-400/80', border: 'border-emerald-500', hover: 'hover:bg-emerald-500' },
] as const;

export const UNCLUSTERED_PAINT_STYLE = {
  fill: 'bg-slate-300/90',
  border: 'border-slate-400',
  hover: 'hover:bg-slate-400',
} as const;

export const paintStyleForCluster = (clusterIndex: number | null) => {
  if (clusterIndex === null) return UNCLUSTERED_PAINT_STYLE;
  return CLUSTER_PAINT_STYLES[clusterIndex % CLUSTER_PAINT_STYLES.length];
};
