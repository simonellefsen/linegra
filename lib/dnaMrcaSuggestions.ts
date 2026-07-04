// K2 — MRCA suggestion engine: propose most-recent-common-ancestor candidates by combining
// genealogical relationship math with shared-match lineage paths and cluster overlap.

import { Relationship } from '../types';
import { computeRelationship } from './relationshipCalculator';

export interface MatchLineageInput {
  matchId: string;
  counterpartPersonId: string;
  counterpartPersonName: string;
  sharedCM: number | null;
  segments: number | null;
  pathPersonIds: string[];
  pathRelationshipIds: string[];
  pathFound: boolean;
  pathFitsPrediction: boolean;
  clusterIndex?: number | null;
}

export interface MrcaCandidate {
  ancestorPersonId: string;
  ancestorName: string;
  supportingMatchIds: string[];
  supportingMatchNames: string[];
  totalSharedCm: number;
  clusterIndices: number[];
  relationshipLabels: string[];
  primaryRelationshipLabel: string;
  cmCompatibleCount: number;
  pathConvergenceCount: number;
  score: number;
}

export interface MrcaSuggestionOptions {
  /** Minimum supporting matches to include a candidate. Default 1. */
  minSupportingMatches?: number;
  /** Cluster groups (arrays of match ids) for overlap weighting. */
  clusterGroups?: string[][];
}

interface CandidateAccumulator {
  ancestorPersonId: string;
  matchIds: Set<string>;
  matchNames: Map<string, string>;
  totalSharedCm: number;
  clusterIndices: Set<number>;
  relationshipLabels: string[];
  cmCompatibleCount: number;
  pathConvergenceCount: number;
}

const tallyLabel = (labels: string[]): string => {
  const counts = new Map<string, number>();
  labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'related';
};

const scoreCandidate = (acc: CandidateAccumulator): number => {
  const support = acc.matchIds.size;
  const clusterBonus = acc.clusterIndices.size * 20;
  const convergenceBonus = acc.pathConvergenceCount * 15;
  const cmBonus = acc.cmCompatibleCount * 5;
  return support * 100 + acc.totalSharedCm + clusterBonus + convergenceBonus + cmBonus;
};

/**
 * Suggest MRCA candidates for a tester from their shared autosomal matches.
 * Uses `computeRelationship` per match and boosts ancestors that appear on multiple lineage paths.
 */
export const suggestMrcaCandidates = (
  testerPersonId: string,
  matches: MatchLineageInput[],
  relationships: Relationship[],
  resolveName: (personId: string) => string,
  options: MrcaSuggestionOptions = {}
): MrcaCandidate[] => {
  const minSupporting = options.minSupportingMatches ?? 1;
  const clusterIndexByMatchId = new Map<string, number>();
  (options.clusterGroups || []).forEach((group, index) => {
    group.forEach((matchId) => clusterIndexByMatchId.set(matchId, index));
  });

  const accumulators = new Map<string, CandidateAccumulator>();
  const pathNodeHits = new Map<string, number>();

  matches.forEach((match) => {
    if (match.pathPersonIds.length >= 3) {
      match.pathPersonIds.slice(1, -1).forEach((personId) => {
        pathNodeHits.set(personId, (pathNodeHits.get(personId) || 0) + 1);
      });
    }
  });

  const ensureAccumulator = (ancestorId: string): CandidateAccumulator => {
    const existing = accumulators.get(ancestorId);
    if (existing) return existing;
    const created: CandidateAccumulator = {
      ancestorPersonId: ancestorId,
      matchIds: new Set(),
      matchNames: new Map(),
      totalSharedCm: 0,
      clusterIndices: new Set(),
      relationshipLabels: [],
      cmCompatibleCount: 0,
      pathConvergenceCount: 0,
    };
    accumulators.set(ancestorId, created);
    return created;
  };

  matches.forEach((match) => {
    const rel = computeRelationship(testerPersonId, match.counterpartPersonId, relationships);
    if (!rel) return;

    const clusterIndex =
      match.clusterIndex ?? clusterIndexByMatchId.get(match.matchId) ?? null;

    rel.commonAncestorIds.forEach((ancestorId) => {
      const acc = ensureAccumulator(ancestorId);
      acc.matchIds.add(match.matchId);
      acc.matchNames.set(match.matchId, match.counterpartPersonName);
      if (typeof match.sharedCM === 'number') acc.totalSharedCm += match.sharedCM;
      if (clusterIndex !== null) acc.clusterIndices.add(clusterIndex);
      acc.relationshipLabels.push(rel.label);
      if (match.pathFitsPrediction) acc.cmCompatibleCount += 1;
    });
  });

  pathNodeHits.forEach((hits, personId) => {
    if (hits < 2) return;
    const acc = accumulators.get(personId);
    if (acc) acc.pathConvergenceCount = hits;
  });

  return [...accumulators.values()]
    .filter((acc) => acc.matchIds.size >= minSupporting)
    .map((acc) => ({
      ancestorPersonId: acc.ancestorPersonId,
      ancestorName: resolveName(acc.ancestorPersonId),
      supportingMatchIds: [...acc.matchIds],
      supportingMatchNames: [...acc.matchIds].map((id) => acc.matchNames.get(id) || id),
      totalSharedCm: acc.totalSharedCm,
      clusterIndices: [...acc.clusterIndices].sort((a, b) => a - b),
      relationshipLabels: acc.relationshipLabels,
      primaryRelationshipLabel: tallyLabel(acc.relationshipLabels),
      cmCompatibleCount: acc.cmCompatibleCount,
      pathConvergenceCount: acc.pathConvergenceCount,
      score: scoreCandidate(acc),
    }))
    .sort((a, b) => b.score - a.score || b.supportingMatchIds.length - a.supportingMatchIds.length);
};
