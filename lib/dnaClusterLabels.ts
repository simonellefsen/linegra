// K8f — human-readable Leeds cluster labels from K2 MRCA suggestions.

import type { MrcaCandidate } from './dnaMrcaSuggestions';

export const buildClusterLabelByIndex = (
  clusterCount: number,
  mrcaCandidates: MrcaCandidate[]
): Map<number, string> => {
  const labels = new Map<number, string>();
  for (let index = 0; index < clusterCount; index += 1) {
    const ranked = mrcaCandidates
      .filter((candidate) => candidate.clusterIndices.includes(index))
      .sort((a, b) => b.score - a.score);
    labels.set(index, ranked[0] ? `${ranked[0].ancestorName} branch` : `Cluster ${index + 1}`);
  }
  return labels;
};

export const formatClusterHeading = (
  clusterIndex: number,
  matchCount: number,
  labels: Map<number, string>
): string => `${labels.get(clusterIndex) ?? `Cluster ${clusterIndex + 1}`} · ${matchCount} matches`;
