// K8f / K1 — human-readable Leeds cluster labels from grandparent paths + K2 MRCA.

import type { GrandparentSlot } from './dnaParentalHints';
import { grandparentSlotShortLabel } from './dnaParentalHints';
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

/** Prefer documented four-grandparent Leeds slots; fall back to K2 MRCA branch names. */
export const buildLeedsClusterLabels = (
  clusterGroups: string[][],
  grandparentSlots: GrandparentSlot[],
  grandparentSlotByMatchId: Map<string, GrandparentSlot | null>,
  mrcaCandidates: MrcaCandidate[]
): Map<number, string> => {
  const mrcaLabels = buildClusterLabelByIndex(clusterGroups.length, mrcaCandidates);
  const labels = new Map<number, string>();

  clusterGroups.forEach((group, index) => {
    const slotVotes = new Map<string, number>();
    group.forEach((matchId) => {
      const slot = grandparentSlotByMatchId.get(matchId);
      if (slot) slotVotes.set(slot.key, (slotVotes.get(slot.key) || 0) + 1);
    });
    const dominantKey = [...slotVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const dominantSlot = grandparentSlots.find((slot) => slot.key === dominantKey);
    if (dominantSlot) {
      labels.set(
        index,
        `${grandparentSlotShortLabel(dominantSlot.key)} · ${dominantSlot.label}`
      );
    } else {
      labels.set(index, mrcaLabels.get(index) ?? `Cluster ${index + 1}`);
    }
  });

  return labels;
};

export const formatClusterHeading = (
  clusterIndex: number,
  matchCount: number,
  labels: Map<number, string>
): string => `${labels.get(clusterIndex) ?? `Cluster ${clusterIndex + 1}`} · ${matchCount} matches`;
