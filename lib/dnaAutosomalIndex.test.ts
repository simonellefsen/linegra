import { describe, expect, it } from 'vitest';
import {
  buildAutosomalMarkerIndex,
  compareAutosomalMarkerIndices,
  deserializeMarkerIndex,
  serializeMarkerIndex,
} from './dnaAutosomalIndex';

const csv = `RSID,CHROMOSOME,POSITION,RESULT
rs1,1,100,AG
rs2,1,200,CT
rs3,2,300,--
rs4,2,400,GG`;

describe('buildAutosomalMarkerIndex', () => {
  it('indexes called SNPs only', () => {
    const index = buildAutosomalMarkerIndex(csv);
    expect(index.calledMarkers).toBe(3);
    expect(index.noCallMarkers).toBe(1);
    expect(index.markers.rs1).toBe('AG');
  });
});

describe('compareAutosomalMarkerIndices', () => {
  it('counts shared and half-identical SNPs', () => {
    const left = buildAutosomalMarkerIndex(csv);
    const rightCsv = `RSID,CHROMOSOME,POSITION,RESULT
rs1,1,100,AG
rs2,1,200,TC
rs5,3,500,AA`;
    const right = buildAutosomalMarkerIndex(rightCsv);
    const comparison = compareAutosomalMarkerIndices(left, right);
    expect(comparison.sharedSnps).toBe(2);
    expect(comparison.halfIdenticalSnps).toBe(1);
    expect(comparison.mismatches).toBe(0);
  });
});

describe('serializeMarkerIndex', () => {
  it('round-trips marker maps', () => {
    const index = buildAutosomalMarkerIndex(csv);
    const restored = deserializeMarkerIndex(serializeMarkerIndex(index), {
      calledMarkers: index.calledMarkers,
      noCallMarkers: index.noCallMarkers,
      chromosomeCount: index.chromosomeCount,
      indexVersion: 1,
    });
    expect(restored.markers.rs4).toBe('GG');
  });
});
