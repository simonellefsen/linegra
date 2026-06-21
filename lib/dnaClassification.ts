// Pure autosomal-DNA classification helpers.
//
// These translate observed shared centimorgans (cM) and segment counts into
// coarse confidence / relationship hints, and gate how many lineage "hops" are
// plausible for a given amount of shared DNA. They are intentionally free of any
// Supabase / network dependency so they can be unit-tested in isolation and
// reused by both the admin DNA panel and the lineage resolver.
//
// Caveat: cM ranges overlap heavily between relationship types, so every result
// here is a *hint*, never proof. See wiki/sources/dna-cm-ranges.md.

export type DnaMatchConfidence = 'High' | 'Medium' | 'Low';

/** Bucket a match into High/Medium/Low confidence from shared cM and segment count. */
export const deriveMatchConfidence = (sharedCM: number, segments: number): DnaMatchConfidence => {
  if (sharedCM >= 90 || segments >= 6) return 'High';
  if (sharedCM >= 40 || segments >= 3) return 'Medium';
  return 'Low';
};

/**
 * Whether a documented lineage path of `hops` relationships is plausible given
 * the shared cM. More shared DNA implies a closer (fewer-hop) relationship, so
 * large cM with a very long path is rejected. Unknown/zero cM is permissive.
 */
export const supportsRelationshipHops = (sharedCM: number | null, hops: number): boolean => {
  if (!sharedCM || sharedCM <= 0) return true;
  if (sharedCM >= 1300) return hops <= 4;
  if (sharedCM >= 680) return hops <= 6;
  if (sharedCM >= 200) return hops <= 8;
  if (sharedCM >= 90) return hops <= 10;
  if (sharedCM >= 40) return hops <= 12;
  return hops <= 16;
};

/** Human-readable relationship-cluster label from shared cM (and segments as a tiebreaker). */
export const relationshipPredictionLabel = (sharedCM: number | null, segments: number | null): string => {
  if (!sharedCM || sharedCM <= 0) return 'Insufficient cM data';
  if (sharedCM >= 2300) return 'Parent/Child or Full Sibling';
  if (sharedCM >= 1300) return 'Close family (1st-degree cluster)';
  if (sharedCM >= 680) return '1st cousin / great-grand relation cluster';
  if (sharedCM >= 200) return '2nd cousin cluster';
  if (sharedCM >= 90) return '3rd cousin cluster';
  if (sharedCM >= 40) return '4th cousin cluster';
  if ((segments || 0) >= 4) return 'Distant but likely related';
  return 'Very distant / uncertain';
};

export interface SharedLineageStatus {
  /** A lineage path has been linked in the tree (>=1 relationship link). */
  pathFound: boolean;
  /** The linked path length is consistent with the observed shared cM. */
  cmCompatible: boolean;
  /** The cM-based relationship-cluster prediction. */
  prediction: string;
}

/**
 * Summarize the resolved-lineage status of a shared-DNA match. This is the single
 * source of truth shared by the admin DNA panel (server-computed `pathFitsPrediction`
 * / `predictionLabel`) and the profile DNA tab, so both surfaces agree (SPEC §6.3).
 * Mirrors the resolver in services/archive.ts:
 *   pathFitsPrediction = pathFound ? supportsRelationshipHops(cm, pathLen) : false
 *   predictionLabel    = relationshipPredictionLabel(cm, segments)
 */
export const describeSharedLineage = (
  totalCentimorgans: number | null,
  segmentCount: number | null,
  pathRelationshipCount: number,
): SharedLineageStatus => {
  const pathFound = pathRelationshipCount > 0;
  return {
    pathFound,
    cmCompatible: pathFound && supportsRelationshipHops(totalCentimorgans, pathRelationshipCount),
    prediction: relationshipPredictionLabel(totalCentimorgans, segmentCount),
  };
};
