// K9 — rank ancestor couples with weak/no DNA coverage for unplaced shared matches.

import type { Relationship } from '../types';
import { relationshipPredictionLabel } from './dnaClassification';
import { buildRelationshipMaps, PARENTAL_TYPES } from './bookComposer';
import { dnaSupportMatchIds } from './dnaSupport';

const parentalSet = new Set(PARENTAL_TYPES);

export interface AncestorCouple {
  key: string;
  personAId: string;
  personBId: string;
  personAName: string;
  personBName: string;
  /** Generations above the focus person (1 = parents). */
  generation: number;
}

export type CoupleCoverageTier = 'none' | 'weak' | 'covered';

export interface UncoveredBranchCandidate {
  couple: AncestorCouple;
  coverageTier: CoupleCoverageTier;
  strongestBackingCm: number;
  bandLabel: string;
  excludedByCluster: boolean;
  score: number;
  rationale: string;
  researchTodo: string;
}

export interface UncoveredBranchInput {
  focusPersonId: string;
  sharedCM: number | null;
  segments: number | null;
  relationships: Relationship[];
  resolveName: (personId: string) => string;
  /** dna_matches.id → shared cM */
  dnaMatchCmById?: Map<string, number> | Record<string, number>;
  /** Cluster indices the unknown match belongs to (empty when unclustered). */
  matchClusterIndices?: number[];
  /** K2 rows with cluster membership — used to down-weight triangulated branches. */
  mrcaCandidates?: Array<{ ancestorPersonId: string; clusterIndices: number[] }>;
}

export const coupleUnionKey = (personAId: string, personBId: string): string =>
  [personAId, personBId].sort().join(':');

export const cousinGenerationBand = (
  sharedCM: number | null
): { minGen: number; maxGen: number; bandLabel: string } => {
  const label = relationshipPredictionLabel(sharedCM, null);
  if (!sharedCM || sharedCM <= 0) return { minGen: 2, maxGen: 8, bandLabel: label };
  if (sharedCM >= 680) return { minGen: 1, maxGen: 3, bandLabel: label };
  if (sharedCM >= 200) return { minGen: 3, maxGen: 5, bandLabel: label };
  if (sharedCM >= 90) return { minGen: 4, maxGen: 6, bandLabel: label };
  if (sharedCM >= 40) return { minGen: 5, maxGen: 7, bandLabel: label };
  return { minGen: 5, maxGen: 10, bandLabel: label };
};

const cmForMatchId = (
  matchId: string,
  lookup?: Map<string, number> | Record<string, number>
): number => {
  if (!lookup) return 0;
  if (lookup instanceof Map) return lookup.get(matchId) ?? 0;
  return lookup[matchId] ?? 0;
};

const buildAncestorLayers = (focusPersonId: string, relationships: Relationship[]): Map<number, Set<string>> => {
  const { parentsByChild } = buildRelationshipMaps(relationships);
  const layers = new Map<number, Set<string>>();
  layers.set(0, new Set([focusPersonId]));
  let frontier = [focusPersonId];
  for (let generation = 1; generation <= 12; generation += 1) {
    const next = new Set<string>();
    frontier.forEach((childId) => {
      (parentsByChild.get(childId) || []).forEach((rel) => {
        if (parentalSet.has(rel.type)) next.add(rel.personId);
      });
    });
    if (!next.size) break;
    layers.set(generation, next);
    frontier = [...next];
  }
  return layers;
};

const collectDescendants = (
  rootIds: string[],
  childrenByParent: Map<string, Relationship[]>
): Set<string> => {
  const seen = new Set<string>();
  const queue = [...rootIds];
  while (queue.length) {
    const personId = queue.shift()!;
    if (seen.has(personId)) continue;
    seen.add(personId);
    (childrenByParent.get(personId) || []).forEach((rel) => {
      if (parentalSet.has(rel.type)) queue.push(rel.relatedId);
    });
  }
  return seen;
};

const childrenSharedByCouple = (
  personAId: string,
  personBId: string,
  parentsByChild: Map<string, Relationship[]>
): string[] => {
  const parentSet = new Set([personAId, personBId]);
  const children: string[] = [];
  parentsByChild.forEach((parentRels, childId) => {
    const bioParents = parentRels
      .filter((rel) => rel.type === 'bio_father' || rel.type === 'bio_mother' || rel.type === 'child')
      .map((rel) => rel.personId);
    if (bioParents.length >= 2 && bioParents.every((id) => parentSet.has(id))) {
      children.push(childId);
      return;
    }
    const anyParents = parentRels.map((rel) => rel.personId);
    if (anyParents.includes(personAId) && anyParents.includes(personBId)) {
      children.push(childId);
    }
  });
  return [...new Set(children)];
};

export const enumerateAncestorCouples = (
  focusPersonId: string,
  relationships: Relationship[],
  resolveName: (personId: string) => string
): AncestorCouple[] => {
  const layers = buildAncestorLayers(focusPersonId, relationships);
  const { parentsByChild } = buildRelationshipMaps(relationships);
  const couples = new Map<string, AncestorCouple>();

  for (let generation = 1; generation <= 12; generation += 1) {
    const childLayer = layers.get(generation - 1);
    if (!childLayer?.size) continue;
    childLayer.forEach((childId) => {
      const parentRels = (parentsByChild.get(childId) || []).filter((rel) => parentalSet.has(rel.type));
      const parentIds = [...new Set(parentRels.map((rel) => rel.personId))];
      if (parentIds.length < 2) return;
      const [personAId, personBId] = parentIds.slice(0, 2);
      const key = coupleUnionKey(personAId, personBId);
      if (couples.has(key)) return;
      couples.set(key, {
        key,
        personAId,
        personBId,
        personAName: resolveName(personAId),
        personBName: resolveName(personBId),
        generation,
      });
    });
  }

  return [...couples.values()];
};

const measureCoupleCoverage = (
  couple: AncestorCouple,
  relationships: Relationship[],
  parentsByChild: Map<string, Relationship[]>,
  childrenByParent: Map<string, Relationship[]>,
  dnaMatchCmById?: Map<string, number> | Record<string, number>
): { tier: CoupleCoverageTier; strongestBackingCm: number } => {
  const childIds = childrenSharedByCouple(couple.personAId, couple.personBId, parentsByChild);
  const subtree = collectDescendants(childIds, childrenByParent);
  subtree.add(couple.personAId);
  subtree.add(couple.personBId);

  let strongestBackingCm = 0;
  let hasSupport = false;
  relationships.forEach((rel) => {
    const matchIds = dnaSupportMatchIds(rel.metadata as Record<string, unknown> | undefined);
    if (!matchIds.length) return;
    if (!subtree.has(rel.personId) && !subtree.has(rel.relatedId)) return;
    hasSupport = true;
    matchIds.forEach((matchId) => {
      strongestBackingCm = Math.max(strongestBackingCm, cmForMatchId(matchId, dnaMatchCmById));
    });
  });

  if (!hasSupport) return { tier: 'none', strongestBackingCm: 0 };
  if (strongestBackingCm < 40) return { tier: 'weak', strongestBackingCm };
  return { tier: 'covered', strongestBackingCm };
};

export const suggestUncoveredBranchCandidates = (input: UncoveredBranchInput): UncoveredBranchCandidate[] => {
  const { focusPersonId, sharedCM, relationships, resolveName, dnaMatchCmById } = input;
  if (!focusPersonId || !relationships.length) return [];

  const band = cousinGenerationBand(sharedCM);
  const couples = enumerateAncestorCouples(focusPersonId, relationships, resolveName).filter(
    (couple) => couple.generation >= band.minGen && couple.generation <= band.maxGen
  );
  if (!couples.length) return [];

  const maps = buildRelationshipMaps(relationships);
  const matchClusters = new Set(input.matchClusterIndices ?? []);
  const clusteredMrcaIds = new Set<string>();
  (input.mrcaCandidates ?? []).forEach((candidate) => {
    if (!candidate.clusterIndices.length) return;
    candidate.clusterIndices.forEach((index) => {
      if (!matchClusters.has(index)) clusteredMrcaIds.add(candidate.ancestorPersonId);
    });
  });

  const uncoveredInBand = couples.filter((couple) => {
    const { tier } = measureCoupleCoverage(
      couple,
      relationships,
      maps.parentsByChild,
      maps.childrenByParent,
      dnaMatchCmById
    );
    return tier === 'none' || tier === 'weak';
  });

  return couples
    .map((couple) => {
      const { tier, strongestBackingCm } = measureCoupleCoverage(
        couple,
        relationships,
        maps.parentsByChild,
        maps.childrenByParent,
        dnaMatchCmById
      );
      const excludedByCluster =
        clusteredMrcaIds.has(couple.personAId) ||
        clusteredMrcaIds.has(couple.personBId);
      const coupleLabel = `${couple.personAName} & ${couple.personBName}`;
      const onlyUncovered =
        uncoveredInBand.length === 1 && uncoveredInBand[0]?.key === couple.key;

      let score = 250;
      if (tier === 'none') score += 180;
      if (tier === 'weak') score += 60;
      if (tier === 'covered') score -= 200;
      if (excludedByCluster) score -= 220;
      if (onlyUncovered) score += 120;

      const coveragePhrase =
        tier === 'none'
          ? 'no DNA-backed descendants on this line yet'
          : tier === 'weak'
            ? `only weak DNA backing (${strongestBackingCm.toFixed(1)} cM)`
            : `line already has ${strongestBackingCm.toFixed(1)} cM DNA support`;

      const clusterPhrase = excludedByCluster
        ? 'Other matches triangulate on a different branch — down-ranked.'
        : matchClusters.size
          ? 'Does not cluster with triangulated matches.'
          : 'No segment triangulation — fits an uncovered line.';

      const rationale = `Likely via ${coupleLabel} (gen ${couple.generation}, ${band.bandLabel}) — ${coveragePhrase}. ${clusterPhrase}${
        onlyUncovered ? ' Only uncovered couple in this cM band.' : ''
      }`;

      const researchTodo = `Research to-do: trace descendants of ${coupleLabel}; compare their shared matches and segment CSVs against this test.`;

      return {
        couple,
        coverageTier: tier,
        strongestBackingCm,
        bandLabel: band.bandLabel,
        excludedByCluster,
        score,
        rationale,
        researchTodo,
      };
    })
    .filter((item) => item.coverageTier !== 'covered' && item.score > 0)
    .sort((a, b) => b.score - a.score);
};

/** Person ids that belong to couples with no/weak DNA coverage (for pedigree amber halos). */
export const collectCoverageGapPersonIds = (
  focusPersonId: string,
  relationships: Relationship[],
  resolveName: (personId: string) => string,
  dnaMatchCmById?: Map<string, number> | Record<string, number>
): Set<string> => {
  const ids = new Set<string>();
  const maps = buildRelationshipMaps(relationships);
  enumerateAncestorCouples(focusPersonId, relationships, resolveName).forEach((couple) => {
    const { tier } = measureCoupleCoverage(
      couple,
      relationships,
      maps.parentsByChild,
      maps.childrenByParent,
      dnaMatchCmById
    );
    if (tier === 'none' || tier === 'weak') {
      ids.add(couple.personAId);
      ids.add(couple.personBId);
    }
  });
  return ids;
};
