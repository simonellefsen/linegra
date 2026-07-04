// Roadmap U5/U8 — bucket family connections into crawlable link lists.

import type { Relationship, RelationshipType } from '../types';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildPersonUrl } from './publicRoutes';

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];
const parentalSet = new Set<RelationshipType>(PARENTAL_TYPES);

const RELATIONSHIP_LABELS: Partial<Record<RelationshipType, string>> = {
  bio_father: 'Father',
  bio_mother: 'Mother',
  adoptive_father: 'Adoptive father',
  adoptive_mother: 'Adoptive mother',
  step_parent: 'Step-parent',
  guardian: 'Guardian',
  marriage: 'Spouse',
  partner: 'Partner',
};

export interface PublicCrawlPersonRef {
  id: string;
  treeId: string;
  name: string;
  href: string;
  rel: 'parent' | 'child' | 'spouse' | 'sibling';
  relationshipType: RelationshipType;
  relationshipLabel: string;
}

export interface PublicCrawlRelationshipGroups {
  parents: PublicCrawlPersonRef[];
  spouses: PublicCrawlPersonRef[];
  children: PublicCrawlPersonRef[];
  siblings: PublicCrawlPersonRef[];
}

type PersonRow = {
  id: string;
  treeId: string;
  firstName?: string;
  lastName?: string;
  title?: string;
};

const refFor = (
  person: PersonRow,
  rel: PublicCrawlPersonRef['rel'],
  relationshipType: RelationshipType,
  origin?: string
): PublicCrawlPersonRef => ({
  id: person.id,
  treeId: person.treeId,
  name: formatPersonDisplayName(person),
  href: buildPersonUrl(person.treeId, person.id, origin),
  rel,
  relationshipType,
  relationshipLabel: RELATIONSHIP_LABELS[relationshipType] ?? relationshipType,
});

export const bucketPublicCrawlRelationships = (
  focusId: string,
  treeId: string,
  relationships: Relationship[],
  people: PersonRow[],
  origin?: string
): PublicCrawlRelationshipGroups => {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const parents = new Map<string, PublicCrawlPersonRef>();
  const spouses = new Map<string, PublicCrawlPersonRef>();
  const children = new Map<string, PublicCrawlPersonRef>();
  const siblings = new Map<string, PublicCrawlPersonRef>();

  const parentIds = new Set<string>();
  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    if (rel.relatedId === focusId && rel.personId) {
      parentIds.add(rel.personId);
      const person = peopleById.get(rel.personId);
      if (person) parents.set(person.id, refFor(person, 'parent', rel.type, origin));
    }
    if (rel.personId === focusId && rel.relatedId) {
      const person = peopleById.get(rel.relatedId);
      if (person) children.set(person.id, refFor(person, 'child', rel.type, origin));
    }
  }

  for (const rel of relationships) {
    if (rel.type === 'marriage' || rel.type === 'partner') {
      const otherId = rel.personId === focusId ? rel.relatedId : rel.personId;
      const person = otherId ? peopleById.get(otherId) : undefined;
      if (person) spouses.set(person.id, refFor(person, 'spouse', rel.type, origin));
    }
    if (parentalSet.has(rel.type) && parentIds.has(rel.personId) && rel.relatedId !== focusId) {
      const person = peopleById.get(rel.relatedId);
      if (person) siblings.set(person.id, refFor(person, 'sibling', rel.type, origin));
    }
  }

  return {
    parents: [...parents.values()],
    spouses: [...spouses.values()],
    children: [...children.values()],
    siblings: [...siblings.values()],
  };
};
