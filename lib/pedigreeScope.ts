import { Person, Relationship } from '../types';
import { indexParentChildLinks } from './parentChildLinks';

const SPOUSE_TYPES = new Set<Relationship['type']>(['marriage', 'partner']);

const buildSpousePairKeys = (relationships: Relationship[]): Set<string> => {
  const keys = new Set<string>();
  relationships.forEach((rel) => {
    if (!SPOUSE_TYPES.has(rel.type)) return;
    const left = rel.personId;
    const right = rel.relatedId;
    keys.add(left < right ? `${left}:${right}` : `${right}:${left}`);
  });
  return keys;
};

const isSpousePair = (spousePairKeys: Set<string>, aId: string, bId: string): boolean =>
  spousePairKeys.has(aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`);

export interface PedigreeScopeResult {
  people: Person[];
  relationships: Relationship[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
  siblingHints: Record<string, boolean>;
  childHints: Record<string, boolean>;
  descendantHints: Record<string, boolean>;
}

export const computePedigreeScope = (
  people: Person[],
  relationships: Relationship[],
  focusId: string | null,
  maxAncestorDepth: number,
  maxDescendantDepth: number,
  peoplePool: Person[] = [],
  relationshipPool: Relationship[] = relationships
): PedigreeScopeResult => {
  if (!focusId || !people.length) {
    return { people: [], relationships: [], hasMoreAncestors: false, hasMoreDescendants: false, siblingHints: {}, childHints: {}, descendantHints: {} };
  }

  const poolById = new Map<string, Person>();
  [...peoplePool, ...people].forEach((person) => poolById.set(person.id, person));
  const peopleById = new Map<string, Person>(people.map((p) => [p.id, p]));
  const focus = peopleById.get(focusId);
  if (!focus) {
    return { people: [], relationships: [], hasMoreAncestors: false, hasMoreDescendants: false, siblingHints: {}, childHints: {}, descendantHints: {} };
  }

  const { parentLinksByChild, childLinksByParent } = indexParentChildLinks(relationships);
  const hintChildLinksByParent =
    relationshipPool === relationships
      ? childLinksByParent
      : indexParentChildLinks(relationshipPool).childLinksByParent;
  const spousePairKeys = buildSpousePairKeys(relationshipPool);

  const allowedPersonIds = new Set<string>([focus.id]);
  const allowedRelationshipIds = new Set<string>();
  let hasMoreAncestors = false;
  let hasMoreDescendants = false;
  const siblingHints: Record<string, boolean> = {};
  const childHints: Record<string, boolean> = {};
  const descendantHints: Record<string, boolean> = {};
  const multiChildParents = new Map<string, string[]>();

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

  const includePersonAndLinks = (personId: string) => {
    if (!poolById.get(personId)) return;
    allowedPersonIds.add(personId);
  };

  Array.from(allowedPersonIds).forEach((personId) => {
    const childLinks = childLinksByParent.get(personId) || [];
    childLinks.forEach((link) => {
      if (!allowedPersonIds.has(link.relatedId)) return;
      (parentLinksByChild.get(link.relatedId) || []).forEach((parentLink) => {
        includePersonAndLinks(parentLink.personId);
        allowedRelationshipIds.add(parentLink.id);
      });
    });
  });

  relationships.forEach((rel) => {
    if (rel.type !== 'marriage' && rel.type !== 'partner') return;
    const touchesFocus =
      rel.personId === focus.id || rel.relatedId === focus.id;
    if (!touchesFocus) return;
    includePersonAndLinks(rel.personId === focus.id ? rel.relatedId : rel.personId);
    allowedRelationshipIds.add(rel.id);
  });

  hintChildLinksByParent.forEach((links, parentId) => {
    if (!allowedPersonIds.has(parentId)) return;
    const realChildIds: string[] = [];
    let hasHiddenChild = false;
    links.forEach((link) => {
      if (isSpousePair(spousePairKeys, parentId, link.relatedId)) return;
      realChildIds.push(link.relatedId);
      if (!allowedPersonIds.has(link.relatedId)) {
        allowedRelationshipIds.add(link.id);
        hasHiddenChild = true;
      }
    });
    if (!realChildIds.length) return;
    childHints[parentId] = true;
    if (hasHiddenChild) descendantHints[parentId] = true;
    if (realChildIds.length > 1) multiChildParents.set(parentId, realChildIds);
  });

  allowedPersonIds.forEach((personId) => {
    const parentLinks = parentLinksByChild.get(personId);
    if (!parentLinks?.length) return;
    for (const parentLink of parentLinks) {
      const siblingIds = multiChildParents.get(parentLink.personId);
      if (!siblingIds) continue;
      if (siblingIds.some((siblingId) => !allowedPersonIds.has(siblingId))) {
        siblingHints[personId] = true;
        break;
      }
    }
  });

  const scopedPeople = Array.from(allowedPersonIds)
    .map((personId) => poolById.get(personId))
    .filter((person): person is Person => !!person);
  const scopedRelationships = relationships.filter((rel) => allowedRelationshipIds.has(rel.id));

  return {
    people: scopedPeople.length ? scopedPeople : [focus],
    relationships: scopedRelationships,
    hasMoreAncestors,
    hasMoreDescendants,
    siblingHints,
    childHints,
    descendantHints,
  };
};
