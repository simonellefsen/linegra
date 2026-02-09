import { Person, Relationship, RelationshipType } from '../types';

export interface PedigreeScopeResult {
  people: Person[];
  relationships: Relationship[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian'
];

const parentalTypeSet = new Set<RelationshipType>(PARENTAL_TYPES);

export const computePedigreeScope = (
  people: Person[],
  relationships: Relationship[],
  focusId: string | null,
  maxAncestorDepth: number,
  maxDescendantDepth: number
): PedigreeScopeResult => {
  if (!focusId || !people.length) {
    return { people: [], relationships: [], hasMoreAncestors: false, hasMoreDescendants: false };
  }

  const peopleById = new Map<string, Person>(people.map((p) => [p.id, p]));
  const focus = peopleById.get(focusId);
  if (!focus) {
    return { people: [], relationships: [], hasMoreAncestors: false, hasMoreDescendants: false };
  }

  const parentLinksByChild = new Map<string, Relationship[]>();
  const childLinksByParent = new Map<string, Relationship[]>();

  relationships.forEach((rel) => {
    if (!parentalTypeSet.has(rel.type)) return;
    parentLinksByChild.set(rel.relatedId, [...(parentLinksByChild.get(rel.relatedId) || []), rel]);
    childLinksByParent.set(rel.personId, [...(childLinksByParent.get(rel.personId) || []), rel]);
  });

  const allowedPersonIds = new Set<string>([focus.id]);
  const allowedRelationshipIds = new Set<string>();
  let hasMoreAncestors = false;
  let hasMoreDescendants = false;

  const ancestorQueue: Array<{ id: string; depth: number }> = [{ id: focus.id, depth: 0 }];
  while (ancestorQueue.length) {
    const { id, depth } = ancestorQueue.shift()!;
    const parentLinks = parentLinksByChild.get(id) || [];
    if (!parentLinks.length) continue;
    if (depth >= maxAncestorDepth) {
      if (parentLinks.some((link) => !!peopleById.get(link.personId))) {
        hasMoreAncestors = true;
      }
      continue;
    }
    parentLinks.forEach((link) => {
      const parent = peopleById.get(link.personId);
      if (!parent) return;
      allowedRelationshipIds.add(link.id);
      if (!allowedPersonIds.has(parent.id)) {
        allowedPersonIds.add(parent.id);
        ancestorQueue.push({ id: parent.id, depth: depth + 1 });
      }
    });
  }

  const descendantQueue: Array<{ id: string; depth: number }> = [{ id: focus.id, depth: 0 }];
  while (descendantQueue.length) {
    const { id, depth } = descendantQueue.shift()!;
    const childLinks = childLinksByParent.get(id) || [];
    if (!childLinks.length) continue;
    if (depth >= maxDescendantDepth) {
      if (childLinks.some((link) => !!peopleById.get(link.relatedId))) {
        hasMoreDescendants = true;
      }
      continue;
    }
    childLinks.forEach((link) => {
      const child = peopleById.get(link.relatedId);
      if (!child) return;
      allowedRelationshipIds.add(link.id);
      if (!allowedPersonIds.has(child.id)) {
        allowedPersonIds.add(child.id);
        descendantQueue.push({ id: child.id, depth: depth + 1 });
      }
    });
  }

  const scopedPeople = people.filter((person) => allowedPersonIds.has(person.id));
  const scopedRelationships = relationships.filter((rel) => allowedRelationshipIds.has(rel.id));

  return {
    people: scopedPeople.length ? scopedPeople : [focus],
    relationships: scopedRelationships,
    hasMoreAncestors,
    hasMoreDescendants,
  };
};
