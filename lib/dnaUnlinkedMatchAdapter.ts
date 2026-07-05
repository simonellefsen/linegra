import type { DNASharedMatchRecord, UnlinkedDnaMatchRecord } from '../types';

/** Adapt a unified shared-list row into the K3 unlinked shape for placement handlers. */
export const sharedMatchToUnlinkedRecord = (
  match: DNASharedMatchRecord
): UnlinkedDnaMatchRecord | null => {
  if (!match.dnaTestId || match.isCounterpartLinked !== false) return null;
  return {
    id: `unlinked:${match.dnaTestId}`,
    dnaTestId: match.dnaTestId,
    ownerPersonId: match.ownerPersonId,
    ownerPersonName: match.ownerPersonName,
    matchName: match.counterpartPersonName,
    sharedCM: match.sharedCM,
    segments: match.segments,
    longestSegment: match.longestSegment,
    predictionLabel: match.predictionLabel,
    confidence: match.confidence,
    fileName: match.fileName,
    importedAt: match.importedAt,
    sharedSegmentsPreview: match.sharedSegmentsPreview,
    suggestedNameMatchPersonId: match.suggestedNameMatchPersonId,
    suggestedNameMatchPersonName: match.suggestedNameMatchPersonName,
    suggestedNameMatchScore: match.suggestedNameMatchScore,
  };
};
