// Roadmap U5/U8 — bucket family connections into crawlable link lists.

import type { Person, Relationship, RelationshipType } from '../types';
import { formatLifespanSuffix } from './publicSlugs';
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

const PARENT_RELATIONSHIP_LABELS: Partial<Record<RelationshipType, string>> = {
  bio_father: 'Father',
  bio_mother: 'Mother',
  adoptive_father: 'Adoptive father',
  adoptive_mother: 'Adoptive mother',
  step_parent: 'Step-parent',
  guardian: 'Guardian',
  child: 'Parent',
};

const SPOUSE_RELATIONSHIP_LABELS: Partial<Record<RelationshipType, string>> = {
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
  gender?: Person['gender'];
  birthDate?: string | null;
  deathDate?: string | null;
};

const childRelationshipLabel = (gender?: Person['gender'] | null): string => {
  if (gender === 'M') return 'Son';
  if (gender === 'F') return 'Daughter';
  return 'Child';
};

const siblingRelationshipLabel = (parentTypes: Set<RelationshipType>): string => {
  const hasStep = [...parentTypes].some((type) => type === 'step_parent');
  const hasBio = [...parentTypes].some((type) => type.startsWith('bio_') || type.startsWith('adoptive_'));
  if (hasStep && hasBio) return 'Half-sibling';
  if (hasStep) return 'Step-sibling';
  return 'Sibling';
};

const displayNameWithLifespan = (person: PersonRow): string =>
  `${formatPersonDisplayName(person)}${formatLifespanSuffix(person)}`;

const refFor = (
  person: PersonRow,
  rel: PublicCrawlPersonRef['rel'],
  relationshipType: RelationshipType,
  relationshipLabel: string,
  origin?: string
): PublicCrawlPersonRef => ({
  id: person.id,
  treeId: person.treeId,
  name: displayNameWithLifespan(person),
  href: buildPersonUrl(person.treeId, person.id, origin),
  rel,
  relationshipType,
  relationshipLabel,
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
  const siblingParentTypes = new Map<string, Set<RelationshipType>>();

  const parentIds = new Set<string>();
  const focusParentTypes = new Map<string, RelationshipType>();

  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    if (rel.relatedId === focusId && rel.personId) {
      parentIds.add(rel.personId);
      focusParentTypes.set(rel.personId, rel.type);
      const person = peopleById.get(rel.personId);
      if (person) {
        parents.set(
          person.id,
          refFor(
            person,
            'parent',
            rel.type,
            PARENT_RELATIONSHIP_LABELS[rel.type] ?? rel.type,
            origin
          )
        );
      }
    }
    if (rel.personId === focusId && rel.relatedId) {
      const person = peopleById.get(rel.relatedId);
      if (person) {
        children.set(
          person.id,
          refFor(person, 'child', 'child', childRelationshipLabel(person.gender), origin)
        );
      }
    }
  }

  for (const rel of relationships) {
    if (rel.type === 'marriage' || rel.type === 'partner') {
      const otherId = rel.personId === focusId ? rel.relatedId : rel.personId;
      const person = otherId ? peopleById.get(otherId) : undefined;
      if (person) {
        spouses.set(
          person.id,
          refFor(
            person,
            'spouse',
            rel.type,
            SPOUSE_RELATIONSHIP_LABELS[rel.type] ?? rel.type,
            origin
          )
        );
      }
    }
    if (parentalSet.has(rel.type) && parentIds.has(rel.personId) && rel.relatedId !== focusId) {
      const person = peopleById.get(rel.relatedId);
      if (!person) continue;
      const sharedTypes = siblingParentTypes.get(person.id) ?? new Set<RelationshipType>();
      sharedTypes.add(rel.type);
      if (focusParentTypes.has(rel.personId)) {
        sharedTypes.add(focusParentTypes.get(rel.personId)!);
      }
      siblingParentTypes.set(person.id, sharedTypes);
      siblings.set(
        person.id,
        refFor(
          person,
          'sibling',
          'child',
          siblingRelationshipLabel(sharedTypes),
          origin
        )
      );
    }
  }

  return {
    parents: [...parents.values()],
    spouses: [...spouses.values()],
    children: [...children.values()],
    siblings: [...siblings.values()],
  };
};
