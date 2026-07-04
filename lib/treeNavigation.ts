// L5/L7 — Pedigree breadcrumbs and keyboard navigation helpers.

import type { Person, Relationship, RelationshipType } from '../types';

const PARENT_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];

const parentTypeSet = new Set<RelationshipType>(PARENT_TYPES);

export interface PedigreeCrumb {
  personId: string;
  label: string;
}

export const buildAncestorBreadcrumbs = (
  focusId: string | undefined,
  people: Person[],
  relationships: Relationship[]
): PedigreeCrumb[] => {
  if (!focusId) return [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const parentLinksByChild = new Map<string, Relationship[]>();

  relationships.forEach((rel) => {
    if (!parentTypeSet.has(rel.type)) return;
    parentLinksByChild.set(rel.relatedId, [...(parentLinksByChild.get(rel.relatedId) || []), rel]);
  });

  const crumbs: PedigreeCrumb[] = [];
  let currentId: string | undefined = focusId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const person = peopleById.get(currentId);
    if (!person) break;
    crumbs.unshift({
      personId: person.id,
      label: `${person.firstName} ${person.lastName}`.trim() || person.id,
    });

    const parentLinks = parentLinksByChild.get(currentId) || [];
    const preferred =
      parentLinks.find((l) => l.type === 'bio_father') ||
      parentLinks.find((l) => l.type === 'bio_mother') ||
      parentLinks[0];
    currentId = preferred?.personId;
  }

  return crumbs;
};

export const findParentIds = (
  childId: string,
  relationships: Relationship[]
): string[] => {
  const ids: string[] = [];
  relationships.forEach((rel) => {
    if (rel.relatedId === childId && parentTypeSet.has(rel.type)) {
      ids.push(rel.personId);
    }
  });
  return ids;
};

export const findChildIds = (
  parentId: string,
  relationships: Relationship[]
): string[] => {
  const ids: string[] = [];
  relationships.forEach((rel) => {
    if (rel.personId === parentId && parentTypeSet.has(rel.type)) {
      ids.push(rel.relatedId);
    }
  });
  return [...new Set(ids)];
};

export const findSiblingIds = (
  personId: string,
  relationships: Relationship[]
): string[] => {
  const parents = findParentIds(personId, relationships);
  const siblings = new Set<string>();
  parents.forEach((parentId) => {
    findChildIds(parentId, relationships).forEach((childId) => {
      if (childId !== personId) siblings.add(childId);
    });
  });
  return [...siblings];
};

export type TreeNavDirection = 'parent' | 'child' | 'sibling-prev' | 'sibling-next';

export const resolveTreeNavTarget = (
  focusId: string,
  direction: TreeNavDirection,
  relationships: Relationship[],
  peopleById: Map<string, Person>
): string | null => {
  if (direction === 'parent') {
    return findParentIds(focusId, relationships).find((id) => peopleById.has(id)) ?? null;
  }

  if (direction === 'child') {
    return findChildIds(focusId, relationships).find((id) => peopleById.has(id)) ?? null;
  }

  const siblings = findSiblingIds(focusId, relationships)
    .filter((id) => peopleById.has(id))
    .sort((a, b) => {
      const pa = peopleById.get(a)!;
      const pb = peopleById.get(b)!;
      return `${pa.firstName}${pa.lastName}`.localeCompare(`${pb.firstName}${pb.lastName}`);
    });

  if (!siblings.length) return null;
  if (direction === 'sibling-next') return siblings[0] ?? null;
  return siblings[siblings.length - 1] ?? null;
};
