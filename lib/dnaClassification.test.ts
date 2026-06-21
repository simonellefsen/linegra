import { describe, it, expect } from 'vitest';
import {
  deriveMatchConfidence,
  supportsRelationshipHops,
  relationshipPredictionLabel,
  describeSharedLineage,
} from './dnaClassification';

describe('deriveMatchConfidence', () => {
  it('is High at/above 90 cM or 6 segments', () => {
    expect(deriveMatchConfidence(90, 0)).toBe('High');
    expect(deriveMatchConfidence(1000, 1)).toBe('High');
    expect(deriveMatchConfidence(10, 6)).toBe('High'); // segment count alone qualifies
  });

  it('is Medium between 40 and 90 cM or 3+ segments', () => {
    expect(deriveMatchConfidence(40, 0)).toBe('Medium');
    expect(deriveMatchConfidence(89, 5)).toBe('Medium');
    expect(deriveMatchConfidence(0, 3)).toBe('Medium');
  });

  it('is Low below the Medium thresholds', () => {
    expect(deriveMatchConfidence(39, 2)).toBe('Low');
    expect(deriveMatchConfidence(0, 0)).toBe('Low');
  });
});

describe('supportsRelationshipHops', () => {
  it('is permissive when cM is missing or non-positive', () => {
    expect(supportsRelationshipHops(null, 100)).toBe(true);
    expect(supportsRelationshipHops(0, 100)).toBe(true);
    expect(supportsRelationshipHops(-5, 100)).toBe(true);
  });

  it('caps hops tighter as shared cM grows', () => {
    // >= 1300 cM => <= 4 hops
    expect(supportsRelationshipHops(1300, 4)).toBe(true);
    expect(supportsRelationshipHops(1300, 5)).toBe(false);
    // >= 680 cM => <= 6 hops
    expect(supportsRelationshipHops(680, 6)).toBe(true);
    expect(supportsRelationshipHops(680, 7)).toBe(false);
    // >= 200 cM => <= 8 hops
    expect(supportsRelationshipHops(200, 8)).toBe(true);
    expect(supportsRelationshipHops(200, 9)).toBe(false);
    // >= 90 cM => <= 10 hops
    expect(supportsRelationshipHops(90, 10)).toBe(true);
    expect(supportsRelationshipHops(90, 11)).toBe(false);
    // >= 40 cM => <= 12 hops
    expect(supportsRelationshipHops(40, 12)).toBe(true);
    expect(supportsRelationshipHops(40, 13)).toBe(false);
    // small positive cM => <= 16 hops
    expect(supportsRelationshipHops(39, 16)).toBe(true);
    expect(supportsRelationshipHops(39, 17)).toBe(false);
  });
});

describe('relationshipPredictionLabel', () => {
  it('reports insufficient data for missing/non-positive cM', () => {
    expect(relationshipPredictionLabel(null, null)).toBe('Insufficient cM data');
    expect(relationshipPredictionLabel(0, 10)).toBe('Insufficient cM data');
  });

  it('maps cM thresholds to cluster labels', () => {
    expect(relationshipPredictionLabel(2300, null)).toBe('Parent/Child or Full Sibling');
    expect(relationshipPredictionLabel(1300, null)).toBe('Close family (1st-degree cluster)');
    expect(relationshipPredictionLabel(680, null)).toBe('1st cousin / great-grand relation cluster');
    expect(relationshipPredictionLabel(200, null)).toBe('2nd cousin cluster');
    expect(relationshipPredictionLabel(90, null)).toBe('3rd cousin cluster');
    expect(relationshipPredictionLabel(40, null)).toBe('4th cousin cluster');
  });

  it('uses segment count to break the low-cM tie', () => {
    expect(relationshipPredictionLabel(39, 4)).toBe('Distant but likely related');
    expect(relationshipPredictionLabel(39, 3)).toBe('Very distant / uncertain');
    expect(relationshipPredictionLabel(39, null)).toBe('Very distant / uncertain');
  });
});

describe('describeSharedLineage', () => {
  it('reports no path when there are no relationship links', () => {
    const s = describeSharedLineage(800, 20, 0);
    expect(s.pathFound).toBe(false);
    expect(s.cmCompatible).toBe(false);
    expect(s.prediction).toBe('1st cousin / great-grand relation cluster');
  });

  it('flags a compatible path (cluster fits the cM)', () => {
    // 800 cM allows <= 6 hops; a 2-link path fits.
    const s = describeSharedLineage(800, 20, 2);
    expect(s.pathFound).toBe(true);
    expect(s.cmCompatible).toBe(true);
  });

  it('flags a cM mismatch (path too long for high cM)', () => {
    // 1500 cM allows <= 4 hops; a 6-link path is implausibly long.
    const s = describeSharedLineage(1500, 40, 6);
    expect(s.pathFound).toBe(true);
    expect(s.cmCompatible).toBe(false);
    expect(s.prediction).toBe('Close family (1st-degree cluster)');
  });
});
