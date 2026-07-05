import { describe, expect, it } from 'vitest';
import { buildClusterLabelByIndex, formatClusterHeading } from './dnaClusterLabels';
import type { MrcaCandidate } from './dnaMrcaSuggestions';

const candidate = (overrides: Partial<MrcaCandidate> & Pick<MrcaCandidate, 'ancestorPersonId'>): MrcaCandidate => ({
  ancestorPersonId: overrides.ancestorPersonId,
  ancestorName: overrides.ancestorName ?? 'Ancestor',
  supportingMatchIds: overrides.supportingMatchIds ?? ['m1'],
  supportingMatchNames: overrides.supportingMatchNames ?? ['Match'],
  totalSharedCm: overrides.totalSharedCm ?? 100,
  clusterIndices: overrides.clusterIndices ?? [],
  relationshipLabels: overrides.relationshipLabels ?? ['2nd cousin'],
  primaryRelationshipLabel: overrides.primaryRelationshipLabel ?? '2nd cousin',
  cmCompatibleCount: overrides.cmCompatibleCount ?? 1,
  pathConvergenceCount: overrides.pathConvergenceCount ?? 0,
  score: overrides.score ?? 200,
});

describe('dnaClusterLabels', () => {
  it('names clusters from the highest-scoring MRCA candidate', () => {
    const labels = buildClusterLabelByIndex(2, [
      candidate({
        ancestorPersonId: 'a1',
        ancestorName: 'Gudrun Olsen',
        clusterIndices: [0],
        score: 300,
      }),
      candidate({
        ancestorPersonId: 'a2',
        ancestorName: 'Other Branch',
        clusterIndices: [0, 1],
        score: 100,
      }),
    ]);
    expect(labels.get(0)).toBe('Gudrun Olsen branch');
    expect(labels.get(1)).toBe('Other Branch branch');
    expect(formatClusterHeading(0, 3, labels)).toBe('Gudrun Olsen branch · 3 matches');
  });

  it('falls back to numbered clusters when K2 has no MRCA for a group', () => {
    const labels = buildClusterLabelByIndex(1, []);
    expect(labels.get(0)).toBe('Cluster 1');
  });
});
