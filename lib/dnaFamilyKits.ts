import { computeRelationship, type RelationshipResult } from './relationshipCalculator';
import type { Relationship, RelationshipType } from '../types';

/** Max pedigree hops for surfacing in-tree family kits (≈ 2nd cousin once removed). */
export const FAMILY_KIT_MAX_MEOSES = 8;

export const relationshipMeioses = (rel: RelationshipResult): number =>
  Math.max(0, rel.pathPersonIds.length - 1);

export const isWithinFamilyKitScope = (
  rel: RelationshipResult | null
): rel is RelationshipResult =>
  rel !== null && rel.kind !== 'self' && relationshipMeioses(rel) <= FAMILY_KIT_MAX_MEOSES;

const capitalizeRelationLabel = (label: string) =>
  label ? label.charAt(0).toUpperCase() + label.slice(1) : label;

/** Typical shared-cM band for a documented relationship (orientation only — see wiki/sources/dna-cm-ranges.md). */
export const formatExpectedCmRange = (rel: RelationshipResult): string => {
  const hops = relationshipMeioses(rel);
  if (rel.kind === 'sibling') {
    return rel.label === 'half-sibling' ? '~680–2200 cM' : '~2000–3400 cM';
  }
  if (rel.kind === 'direct-ancestor' || rel.kind === 'direct-descendant') {
    if (hops === 1) return '~1300–3700 cM';
    if (hops === 2) return '~1300–2300 cM';
    if (hops === 3) return '~680–1400 cM';
    if (hops === 4) return '~340–850 cM';
    return 'variable';
  }
  if (rel.kind === 'aunt-uncle' || rel.kind === 'niece-nephew') {
    return '~1300–2300 cM';
  }
  if (rel.kind === 'cousin') {
    const degree = rel.cousinDegree ?? 1;
    const removed = rel.removed ?? 0;
    if (degree === 1 && removed === 0) return '~850 cM typical';
    if (degree === 1 && removed === 1) return '~430 cM typical';
    if (degree === 2 && removed === 0) return '~230 cM typical';
    if (degree === 2 && removed === 1) return '~115 cM typical';
    if (degree >= 3) return '~90 cM typical';
    return 'distant cousin range';
  }
  return 'see Shared cM Project';
};

export const familyKitPredictionLabel = (relationLabel: string, expectedCmRange?: string) =>
  expectedCmRange
    ? `In-tree family kit (${relationLabel} · typical ${expectedCmRange})`
    : `In-tree family kit (${relationLabel})`;

export const hasEncryptedRawAutosomalMetadata = (metadata: Record<string, unknown>): boolean => {
  const stats = metadata.rawMarkerIndexStats;
  const encrypted = metadata.encryptedRawPayload;
  return (
    typeof encrypted === 'string' ||
    (typeof stats === 'object' && stats !== null && Object.keys(stats as object).length > 0)
  );
};

export interface FamilyKitRelationView {
  relationLabel: string;
  expectedCmRange: string;
  meioses: number;
  pathPersonIds: string[];
}

export const relationshipRowsForCalculator = (
  rows: Array<{ id: string; person_id: string; related_id: string; type?: RelationshipType }>
): Relationship[] =>
  rows
    .filter((row) => row.type)
    .map((row) => ({
      id: row.id,
      treeId: '',
      type: row.type as RelationshipType,
      personId: row.person_id,
      relatedId: row.related_id,
    }));

export const resolveFamilyKitRelation = (
  focusPersonId: string,
  ownerPersonId: string,
  relationships: Relationship[]
): FamilyKitRelationView | null => {
  const rel = computeRelationship(focusPersonId, ownerPersonId, relationships);
  if (!isWithinFamilyKitScope(rel)) return null;
  return {
    relationLabel: capitalizeRelationLabel(rel.label),
    expectedCmRange: formatExpectedCmRange(rel),
    meioses: relationshipMeioses(rel),
    pathPersonIds: rel.pathPersonIds,
  };
};
