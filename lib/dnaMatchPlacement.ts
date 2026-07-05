// K3 — Suggest where unknown (unlinked) DNA matches belong in the tree using cM prediction,
// MRCA candidates, segment-cluster peers, and fuzzy name matches.

import { clusterSharedSegments, type ClusterSegment } from './dnaClustering';
import { formatNameMatchRationale, normalizeNameMatchScore } from './dnaNameMatch';
import type { MrcaCandidate } from './dnaMrcaSuggestions';

export interface UnknownMatchInput {
  matchId: string;
  matchName: string;
  sharedCM: number | null;
  segments: number | null;
  predictionLabel: string;
  segmentsPreview: ClusterSegment[];
}

export interface LinkedMatchSegmentInput {
  matchId: string;
  counterpartName: string;
  segments: ClusterSegment[];
}

export interface NameMatchCandidate {
  personId: string;
  personName: string;
  score: number;
}

export interface PlacementSuggestion {
  kind: 'link_existing' | 'under_mrca' | 'cluster_line' | 'unplaced';
  anchorPersonId?: string;
  anchorPersonName?: string;
  relationshipLabel: string;
  rationale: string;
  score: number;
}

export interface PlacementContext {
  mrcaCandidates: MrcaCandidate[];
  linkedMatches: LinkedMatchSegmentInput[];
  clusterGroups: string[][];
  nameMatchCandidate?: NameMatchCandidate | null;
  minClusterCm?: number;
}

/** Split a display name into first / last for placeholder person creation. */
export const parseMatchDisplayName = (matchName: string): { firstName: string; lastName: string } => {
  const trimmed = matchName.trim();
  if (!trimmed) return { firstName: 'Unknown', lastName: 'DNA Match' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'DNA Match' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
};

const clusterPeersForUnknown = (
  unknown: UnknownMatchInput,
  linkedMatches: LinkedMatchSegmentInput[],
  minClusterCm: number
): string[] => {
  if (!unknown.segmentsPreview.length || !linkedMatches.length) return [];
  const groups = clusterSharedSegments(
    [
      ...linkedMatches.map((match) => ({ matchId: match.matchId, segments: match.segments })),
      { matchId: unknown.matchId, segments: unknown.segmentsPreview },
    ],
    { minCentimorgans: minClusterCm, minIcwOverlapFraction: 0.5 }
  );
  const peerGroup = groups.find((group) => group.includes(unknown.matchId));
  return peerGroup?.filter((id) => id !== unknown.matchId) || [];
};

/**
 * Rank placement suggestions for a match that has no in-tree person row yet.
 */
export const suggestUnknownMatchPlacements = (
  unknown: UnknownMatchInput,
  context: PlacementContext
): PlacementSuggestion[] => {
  const suggestions: PlacementSuggestion[] = [];
  const minClusterCm = context.minClusterCm ?? 7;

  if (context.nameMatchCandidate && normalizeNameMatchScore(context.nameMatchCandidate.score) >= 60) {
    suggestions.push({
      kind: 'link_existing',
      anchorPersonId: context.nameMatchCandidate.personId,
      anchorPersonName: context.nameMatchCandidate.personName,
      relationshipLabel: unknown.predictionLabel,
      rationale: `${formatNameMatchRationale(context.nameMatchCandidate.score)} — link test to existing person instead of creating a duplicate.`,
      score: 900 + context.nameMatchCandidate.score,
    });
  }

  const clusterPeers = clusterPeersForUnknown(unknown, context.linkedMatches, minClusterCm);
  if (clusterPeers.length) {
    const peerNames = clusterPeers
      .map((id) => context.linkedMatches.find((match) => match.matchId === id)?.counterpartName)
      .filter(Boolean)
      .join(', ');
    const peerClusterIndex = context.clusterGroups.findIndex((group) =>
      clusterPeers.some((peerId) => group.includes(peerId))
    );
    const mrcaForCluster =
      peerClusterIndex >= 0 ? context.mrcaCandidates.find((c) => c.clusterIndices.includes(peerClusterIndex)) : null;
    if (mrcaForCluster) {
      suggestions.push({
        kind: 'cluster_line',
        anchorPersonId: mrcaForCluster.ancestorPersonId,
        anchorPersonName: mrcaForCluster.ancestorName,
        relationshipLabel: mrcaForCluster.primaryRelationshipLabel,
        rationale: `Segments overlap ${clusterPeers.length} linked match(es) (${peerNames}) — likely same ${mrcaForCluster.ancestorName} branch.`,
        score: 500 + clusterPeers.length * 40 + mrcaForCluster.supportingMatchIds.length * 10,
      });
    } else {
      suggestions.push({
        kind: 'cluster_line',
        relationshipLabel: unknown.predictionLabel,
        rationale: `Segments overlap linked match(es): ${peerNames}. Place on the same ancestral line.`,
        score: 400 + clusterPeers.length * 30,
      });
    }
  }

  context.mrcaCandidates.slice(0, 3).forEach((candidate, index) => {
    suggestions.push({
      kind: 'under_mrca',
      anchorPersonId: candidate.ancestorPersonId,
      anchorPersonName: candidate.ancestorName,
      relationshipLabel: candidate.primaryRelationshipLabel,
      rationale: `${candidate.supportingMatchIds.length} linked match(es) share MRCA ${candidate.ancestorName} (${candidate.totalSharedCm.toFixed(1)} cM combined).`,
      score: 300 - index * 20 + candidate.supportingMatchIds.length * 15,
    });
  });

  suggestions.push({
    kind: 'unplaced',
    relationshipLabel: unknown.predictionLabel,
    rationale: 'Create a DNA match placeholder person and link the imported test. Add genealogical relationships manually.',
    score: 50,
  });

  const seen = new Set<string>();
  return suggestions
    .filter((item) => {
      const key = `${item.kind}:${item.anchorPersonId || ''}:${item.rationale}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score);
};
