// K8e — human-readable DNA lineage path labels and MRCA breadcrumbs.

import {
  buildChildToParentsMap,
  buildParentToChildrenMap,
  DNA_BLOOD_PATH_RELATIONSHIP_TYPES,
  type BloodRelationshipEdge,
} from './dnaLineagePath';
import { computeRelationship } from './relationshipCalculator';
import type { Relationship } from '../types';

export type LineageRelationshipEdge = BloodRelationshipEdge;

export interface LineageMrcaOptions {
  focusPersonId?: string;
  counterpartPersonId?: string;
}

const bloodEdgesToRelationships = (rows: LineageRelationshipEdge[]): Relationship[] =>
  rows
    .filter((row) => row.type && DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(row.type))
    .map((row) => ({
      id: row.id,
      treeId: '',
      type: (row.type === 'child' ? 'bio_father' : row.type) as Relationship['type'],
      personId: row.person_id,
      relatedId: row.related_id,
    }));

/** Turn from ascent to descent on a focus→counterpart path (topology, not edge labels). */
const pickMrcaFromPathTopology = (
  pathPersonIds: string[],
  relationshipRows: LineageRelationshipEdge[]
): string | null => {
  if (pathPersonIds.length < 2) return null;
  const childToParents = buildChildToParentsMap(relationshipRows);
  const parentToChildren = buildParentToChildrenMap(childToParents);
  let foundAscent = false;
  for (let index = 0; index < pathPersonIds.length - 1; index += 1) {
    const fromPersonId = pathPersonIds[index]!;
    const toPersonId = pathPersonIds[index + 1]!;
    const ascends = childToParents.get(fromPersonId)?.has(toPersonId) ?? false;
    const descends = parentToChildren.get(fromPersonId)?.has(toPersonId) ?? false;
    if (ascends) foundAscent = true;
    if (descends && foundAscent) return fromPersonId;
  }
  return null;
};

const pickMrcaFromFirstParentOfEdge = (
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: LineageRelationshipEdge[]
): string | null => {
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  for (let index = 0; index < pathRelationshipIds.length; index += 1) {
    const fromPersonId = pathPersonIds[index]!;
    const toPersonId = pathPersonIds[index + 1]!;
    const relationship = relationshipById.get(pathRelationshipIds[index]!);
    if (lineageTraversalLabel(relationship, fromPersonId, toPersonId) === 'parent of') {
      return fromPersonId;
    }
  }
  return null;
};

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
  relationshipRows: LineageRelationshipEdge[],
  options?: LineageMrcaOptions
): string | null => {
  if (!pathPersonIds.length) return null;
  if (pathPersonIds.length === 1) return pathPersonIds[0]!;

  const focusPersonId = options?.focusPersonId ?? pathPersonIds[0]!;
  const counterpartPersonId =
    options?.counterpartPersonId ?? pathPersonIds[pathPersonIds.length - 1]!;
  const bloodRows = relationshipRows.filter(
    (row) => row.type && DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(row.type)
  );

  const topologyMrca = pickMrcaFromPathTopology(pathPersonIds, bloodRows);
  if (topologyMrca && topologyMrca !== counterpartPersonId) return topologyMrca;
  if (topologyMrca && pathPersonIds.length <= 2) return topologyMrca;

  if (focusPersonId !== counterpartPersonId) {
    const relationship = computeRelationship(
      focusPersonId,
      counterpartPersonId,
      bloodEdgesToRelationships(bloodRows)
    );
    const calculatorMrca = relationship?.commonAncestorIds[0];
    if (calculatorMrca) return calculatorMrca;
  }

  const labelMrca = pickMrcaFromFirstParentOfEdge(
    pathPersonIds,
    pathRelationshipIds,
    relationshipRows
  );
  if (labelMrca && labelMrca !== counterpartPersonId) return labelMrca;
  if (labelMrca && pathPersonIds.length <= 2) return labelMrca;

  const interior = pathPersonIds.slice(1, -1);
  return interior.length ? interior[interior.length - 1]! : null;
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
  pathNames: Map<string, string> | Record<string, string>,
  options?: LineageMrcaOptions
): LineagePathBreadcrumbNode[] => {
  if (!pathPersonIds.length) return [];
  const nameFor = (personId: string) =>
    pathNames instanceof Map ? pathNames.get(personId) || personId : pathNames[personId] || personId;
  const mrcaId = pickLineageMrcaPersonId(
    pathPersonIds,
    pathRelationshipIds,
    relationshipRows,
    options
  );
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
  pathNames: Map<string, string> | Record<string, string>,
  options?: LineageMrcaOptions
): string => {
  if (!pathPersonIds.length) return 'No lineage path';
  const hopCount = Math.max(0, pathPersonIds.length - 1);
  const mrcaId = pickLineageMrcaPersonId(
    pathPersonIds,
    pathRelationshipIds,
    relationshipRows,
    options
  );
  const nameFor = (personId: string) =>
    pathNames instanceof Map ? pathNames.get(personId) || personId : pathNames[personId] || personId;
  const mrcaName = mrcaId ? nameFor(mrcaId) : null;
  const hopLabel = `${hopCount} hop${hopCount === 1 ? '' : 's'}`;
  return mrcaName ? `${hopLabel} · MRCA ${mrcaName}` : hopLabel;
};
