// K8e — human-readable DNA lineage path labels and MRCA breadcrumbs.

import type { BloodRelationshipEdge } from './dnaLineagePath';

export type LineageRelationshipEdge = BloodRelationshipEdge;

export const lineageTraversalLabel = (
  relationship: LineageRelationshipEdge | undefined,
  fromPersonId: string,
  toPersonId: string
): string => {
  if (!relationship?.type) return 'linked to';
  const forward = relationship.person_id === fromPersonId && relationship.related_id === toPersonId;
  const reverse = relationship.person_id === toPersonId && relationship.related_id === fromPersonId;
  if (!forward && !reverse) return 'linked to';
  const parentTypes = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'guardian', 'step_parent'];
  if (parentTypes.includes(relationship.type)) {
    return forward ? 'parent of' : 'child of';
  }
  if (relationship.type === 'child') {
    return forward ? 'parent of' : 'child of';
  }
  if (relationship.type === 'marriage' || relationship.type === 'partner') {
    return 'partner of';
  }
  return 'linked to';
};

export const buildDnaLineagePathLabel = (
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: LineageRelationshipEdge[],
  pathNames: Map<string, string> | Record<string, string>
): string => {
  if (!pathPersonIds.length) return 'No lineage path found';
  const nameFor = (personId: string) =>
    pathNames instanceof Map ? pathNames.get(personId) || personId : pathNames[personId] || personId;
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  return pathPersonIds
    .map((personId, index) => {
      const name = nameFor(personId);
      if (index === pathPersonIds.length - 1) return name;
      const nextPersonId = pathPersonIds[index + 1]!;
      const relationshipId = pathRelationshipIds[index];
      const relationship = relationshipId ? relationshipById.get(relationshipId) : undefined;
      return `${name} → ${lineageTraversalLabel(relationship, personId, nextPersonId)}`;
    })
    .join(' ');
};

/** Deepest shared ancestor on a focus→counterpart path (turn from ascent to descent). */
export const pickLineageMrcaPersonId = (
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: LineageRelationshipEdge[]
): string | null => {
  if (!pathPersonIds.length) return null;
  if (pathPersonIds.length === 1) return pathPersonIds[0]!;
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  for (let index = 0; index < pathRelationshipIds.length; index += 1) {
    const fromPersonId = pathPersonIds[index]!;
    const toPersonId = pathPersonIds[index + 1]!;
    const relationship = relationshipById.get(pathRelationshipIds[index]!);
    if (lineageTraversalLabel(relationship, fromPersonId, toPersonId) === 'parent of') {
      return fromPersonId;
    }
  }
  return pathPersonIds[pathPersonIds.length - 1]!;
};

export interface LineagePathBreadcrumbNode {
  personId: string;
  name: string;
  /** Edge label toward the next person (parent of / child of / …). */
  edgeLabel?: string;
  isMrca: boolean;
}

export const buildDnaLineagePathBreadcrumb = (
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: LineageRelationshipEdge[],
  pathNames: Map<string, string> | Record<string, string>
): LineagePathBreadcrumbNode[] => {
  if (!pathPersonIds.length) return [];
  const nameFor = (personId: string) =>
    pathNames instanceof Map ? pathNames.get(personId) || personId : pathNames[personId] || personId;
  const mrcaId = pickLineageMrcaPersonId(pathPersonIds, pathRelationshipIds, relationshipRows);
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  return pathPersonIds.map((personId, index) => {
    const nextPersonId = pathPersonIds[index + 1];
    const relationshipId = pathRelationshipIds[index];
    const relationship = relationshipId ? relationshipById.get(relationshipId) : undefined;
    return {
      personId,
      name: nameFor(personId),
      edgeLabel:
        nextPersonId != null
          ? lineageTraversalLabel(relationship, personId, nextPersonId)
          : undefined,
      isMrca: personId === mrcaId,
    };
  });
};

export const formatDnaLineagePathSummary = (
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: LineageRelationshipEdge[],
  pathNames: Map<string, string> | Record<string, string>
): string => {
  if (!pathPersonIds.length) return 'No lineage path';
  const hopCount = Math.max(0, pathPersonIds.length - 1);
  const mrcaId = pickLineageMrcaPersonId(pathPersonIds, pathRelationshipIds, relationshipRows);
  const nameFor = (personId: string) =>
    pathNames instanceof Map ? pathNames.get(personId) || personId : pathNames[personId] || personId;
  const mrcaName = mrcaId ? nameFor(mrcaId) : null;
  const hopLabel = `${hopCount} hop${hopCount === 1 ? '' : 's'}`;
  return mrcaName ? `${hopLabel} · MRCA ${mrcaName}` : hopLabel;
};
