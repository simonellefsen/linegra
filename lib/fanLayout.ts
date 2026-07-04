// L2 — Fan / compact ancestor chart: map pedigree columns + rows to polar coordinates.

import type { PedigreeLayout, PedigreeNode } from './pedigreeLayout';

export interface FanPosition {
  id: string;
  left: number;
  top: number;
  centerX: number;
  centerY: number;
}

export interface FanLayoutResult {
  positions: Map<string, FanPosition>;
  width: number;
  height: number;
  focusCenter: { x: number; y: number };
}

export interface BuildFanLayoutOptions {
  cardWidth?: number;
  cardHeight?: number;
  ringSpacing?: number;
  /** Arc start in degrees (160 = upper-left). */
  startAngleDeg?: number;
  /** Arc end in degrees (20 = upper-right), sweeping through the top. */
  endAngleDeg?: number;
  padding?: number;
}

const MIN_ROW_GAP = 1;

/** Same row packing as the pedigree view so fan slots align with tree spans. */
export const packPedigreeRows = (layout: PedigreeLayout): Map<string, number> => {
  const byColumn = new Map<number, PedigreeNode[]>();
  layout.nodes.forEach((node) => {
    const list = byColumn.get(node.column) || [];
    list.push(node);
    byColumn.set(node.column, list);
  });

  const packed = new Map<string, number>();
  byColumn.forEach((nodesInColumn) => {
    const sorted = [...nodesInColumn].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      if (!!a.placeholder === !!b.placeholder) return 0;
      return a.placeholder ? 1 : -1;
    });

    let lastRow = Number.NEGATIVE_INFINITY;
    sorted.forEach((node) => {
      let nextRow = node.row;
      if (nextRow - lastRow < MIN_ROW_GAP) {
        nextRow = lastRow + MIN_ROW_GAP;
      }
      packed.set(node.id, nextRow);
      lastRow = nextRow;
    });
  });

  return packed;
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Convert a pedigree layout into fan-chart positions (focus at bottom center, ancestors in an arc above).
 * Descendant nodes (column > 0) are omitted from the fan — use the standard pedigree view for those.
 */
export const buildFanLayout = (
  layout: PedigreeLayout,
  options: BuildFanLayoutOptions = {}
): FanLayoutResult => {
  const {
    cardWidth = 160,
    cardHeight = 136,
    ringSpacing = 150,
    startAngleDeg = 160,
    endAngleDeg = 20,
    padding = 48,
  } = options;

  const packedRows = packPedigreeRows(layout);
  const fanNodes = layout.nodes.filter((node) => node.column <= 0);
  const rowValues = fanNodes.map((node) => packedRows.get(node.id) ?? node.row);
  const minRow = rowValues.length ? Math.min(...rowValues) : 0;
  const maxRow = rowValues.length ? Math.max(...rowValues) : 0;
  const rowSpan = Math.max(maxRow - minRow, 1);

  const maxGeneration = fanNodes.reduce(
    (max, node) => Math.max(max, Math.abs(node.column)),
    0
  );
  const maxRadius = maxGeneration * ringSpacing;
  const width = maxRadius * 2 + cardWidth + padding * 2;
  const height = maxRadius + cardHeight + padding * 2 + 40;
  const focusCenter = { x: width / 2, y: height - padding - cardHeight / 2 };

  const startRad = degToRad(startAngleDeg);
  const endRad = degToRad(endAngleDeg);
  const sweep = endRad - startRad;

  const positions = new Map<string, FanPosition>();

  fanNodes.forEach((node) => {
    const packedRow = packedRows.get(node.id) ?? node.row;
    const generation = Math.abs(node.column);

    if (generation === 0) {
      positions.set(node.id, {
        id: node.id,
        left: focusCenter.x - cardWidth / 2,
        top: focusCenter.y - cardHeight / 2,
        centerX: focusCenter.x,
        centerY: focusCenter.y,
      });
      return;
    }

    const t = rowSpan > 0 ? (packedRow - minRow) / rowSpan : 0.5;
    const angle = startRad + t * sweep;
    const radius = generation * ringSpacing;
    const centerX = focusCenter.x + radius * Math.cos(angle);
    const centerY = focusCenter.y - radius * Math.sin(angle);

    positions.set(node.id, {
      id: node.id,
      left: centerX - cardWidth / 2,
      top: centerY - cardHeight / 2,
      centerX,
      centerY,
    });
  });

  return { positions, width, height, focusCenter };
};
