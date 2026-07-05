import type { Person, Relationship } from '../types';
import { isParentChildEdge } from './parentChildLinks';

export interface CoparentSuggestion {
  person: Person;
  sharedChildren: Array<{ person: Person; rel: Relationship }>;
}

/** Other parents who share at least one child with the focus person. */
export const findCoparentSuggestions = (
  focusPersonId: string,
  relationships: Relationship[],
  peopleById: Record<string, Person | undefined>,
  options: { canViewPrivate?: boolean } = {}
): CoparentSuggestion[] => {
  const canViewPrivate = options.canViewPrivate ?? false;
  const myChildIds = new Set<string>();
  relationships.forEach((rel) => {
    if (rel.personId === focusPersonId && isParentChildEdge(rel)) {
      myChildIds.add(rel.relatedId);
    }
  });
  if (myChildIds.size === 0) return [];

  const byCoparentId = new Map<string, CoparentSuggestion>();

  relationships.forEach((rel) => {
    if (!myChildIds.has(rel.relatedId)) return;
    if (rel.personId === focusPersonId) return;
    if (!isParentChildEdge(rel)) return;

    const coparent = peopleById[rel.personId];
    if (!coparent || (!canViewPrivate && coparent.isPrivate)) return;

    const child = peopleById[rel.relatedId];
    if (!child || (!canViewPrivate && child.isPrivate)) return;

    const existing = byCoparentId.get(coparent.id);
    if (existing) {
      if (!existing.sharedChildren.some((entry) => entry.person.id === child.id)) {
        existing.sharedChildren.push({ person: child, rel });
      }
      return;
    }
    byCoparentId.set(coparent.id, {
      person: coparent,
      sharedChildren: [{ person: child, rel }],
    });
  });

  return Array.from(byCoparentId.values()).sort((a, b) =>
    `${a.person.lastName}${a.person.firstName}`.localeCompare(`${b.person.lastName}${b.person.firstName}`)
  );
};
