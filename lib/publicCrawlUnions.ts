// Roadmap U13 — union grouping, marriage facts, and family-page helpers for public crawl.

import type { Person, Relationship, RelationshipType } from '../types';
import { extractId8 } from './publicSlugs';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import type { PublicCrawlPersonRef } from './publicCrawlRelations';
import { buildFamilyUrl, buildPersonUrl } from './publicRoutes';

const PARENTAL_TYPES: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
  'child',
];
const parentalSet = new Set<RelationshipType>(PARENTAL_TYPES);

const UNION_TYPES = new Set<RelationshipType>(['marriage', 'partner']);

const asMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
};

export const relationshipDateFromRow = (row: Record<string, unknown>): string | undefined => {
  const metadata = asMetadata(row.metadata);
  const dateCandidate = metadata.date_text ?? metadata.relationship_date_text;
  return typeof dateCandidate === 'string' && dateCandidate.trim() ? dateCandidate.trim() : undefined;
};

export const relationshipPlaceFromRow = (row: Record<string, unknown>): string | undefined => {
  const metadata = asMetadata(row.metadata);
  const placeCandidate = metadata.place_text ?? metadata.relationship_place_text;
  return typeof placeCandidate === 'string' && placeCandidate.trim() ? placeCandidate.trim() : undefined;
};

export const relationshipDateFromRelationship = (rel: Relationship): string | undefined =>
  rel.date?.trim() || undefined;

export const relationshipPlaceFromRelationship = (rel: Relationship): string | undefined => {
  if (!rel.place) return undefined;
  if (typeof rel.place === 'string') return rel.place.trim() || undefined;
  return rel.place.fullText?.trim() || undefined;
};

export const formatUnionFactsSuffix = (date?: string | null, place?: string | null): string => {
  const parts: string[] = [];
  if (date?.trim()) parts.push(`m. ${date.trim()}`);
  if (place?.trim()) parts.push(place.trim());
  return parts.length ? ` (${parts.join(', ')})` : '';
};

export const formatSpouseRelationshipLabel = (
  unionType: RelationshipType,
  date?: string | null,
  place?: string | null
): string => {
  const base = unionType === 'partner' ? 'Partner' : 'Spouse';
  const facts = formatUnionFactsSuffix(date, place).replace(/^\s*\(/, '').replace(/\)$/, '');
  return facts ? `${base}, ${facts}` : base;
};

export interface PublicCrawlSpouseRef extends PublicCrawlPersonRef {
  unionRelationshipId: string;
  unionDate?: string | null;
  unionPlace?: string | null;
  familyPageHref: string;
}

export interface PublicCrawlChildUnionGroup {
  coparent: PublicCrawlPersonRef | null;
  heading: string;
  familyPageHref?: string | null;
  children: PublicCrawlPersonRef[];
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

export const matchUnionIdPrefix = (relationshipId: string, idPrefix: string): boolean =>
  extractId8(relationshipId) === idPrefix.toLowerCase();

export const findUnionRelationship = (
  relationships: Relationship[],
  spouseA: string,
  spouseB: string
): Relationship | undefined =>
  relationships.find(
    (rel) =>
      UNION_TYPES.has(rel.type) &&
      ((rel.personId === spouseA && rel.relatedId === spouseB) ||
        (rel.personId === spouseB && rel.relatedId === spouseA))
  );

const parentIdsForChild = (childId: string, relationships: Relationship[]): Set<string> => {
  const parents = new Set<string>();
  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    if (rel.relatedId === childId && rel.personId) parents.add(rel.personId);
    if (rel.personId === childId && rel.relatedId) parents.add(rel.relatedId);
  }
  return parents;
};

export const getCoparentIdForChild = (
  childId: string,
  primaryParentId: string,
  relationships: Relationship[]
): string | null => {
  const parents = parentIdsForChild(childId, relationships);
  parents.delete(primaryParentId);
  if (parents.size === 1) return [...parents][0] ?? null;
  return null;
};

const sortChildIdsByAge = (childIds: string[], peopleById: Map<string, PersonRow>): string[] =>
  [...childIds].sort((leftId, rightId) => {
    const leftYear = peopleById.get(leftId)?.birthDate?.match(/(\d{4})/)?.[1] ?? '';
    const rightYear = peopleById.get(rightId)?.birthDate?.match(/(\d{4})/)?.[1] ?? '';
    if (leftYear && rightYear && leftYear !== rightYear) return leftYear.localeCompare(rightYear);
    const leftName = peopleById.get(leftId);
    const rightName = peopleById.get(rightId);
    const leftLabel = leftName ? formatPersonDisplayName(leftName) : leftId;
    const rightLabel = rightName ? formatPersonDisplayName(rightName) : rightId;
    return leftLabel.localeCompare(rightLabel);
  });

export const groupChildIdsByCoparent = (
  childIds: string[],
  primaryParentId: string,
  relationships: Relationship[],
  peopleById: Map<string, PersonRow>
): Array<{ coparentId: string | null; childIds: string[] }> => {
  const byCoparent = new Map<string | null, string[]>();
  childIds.forEach((childId) => {
    const coparentId = getCoparentIdForChild(childId, primaryParentId, relationships);
    const list = byCoparent.get(coparentId) ?? [];
    list.push(childId);
    byCoparent.set(coparentId, list);
  });
  return Array.from(byCoparent.entries()).map(([coparentId, ids]) => ({
    coparentId,
    childIds: sortChildIdsByAge(ids, peopleById),
  }));
};

export const childrenSharedByParents = (
  spouseA: string,
  spouseB: string,
  relationships: Relationship[]
): string[] => {
  const childIds = new Set<string>();
  for (const rel of relationships) {
    if (!parentalSet.has(rel.type)) continue;
    if (rel.personId === spouseA || rel.personId === spouseB) {
      if (rel.relatedId) childIds.add(rel.relatedId);
    }
    if (rel.relatedId === spouseA || rel.relatedId === spouseB) {
      if (rel.personId) childIds.add(rel.personId);
    }
  }
  return [...childIds].filter((childId) => {
    const parents = parentIdsForChild(childId, relationships);
    return parents.has(spouseA) && parents.has(spouseB);
  });
};

export const buildChildUnionGroups = (
  focusId: string,
  treeId: string,
  childRefs: PublicCrawlPersonRef[],
  relationships: Relationship[],
  people: PersonRow[],
  origin?: string
): PublicCrawlChildUnionGroup[] => {
  if (!childRefs.length) return [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const childRefById = new Map(childRefs.map((ref) => [ref.id, ref]));
  const treeRef = { id: treeId };

  return groupChildIdsByCoparent(
    childRefs.map((ref) => ref.id),
    focusId,
    relationships,
    peopleById
  ).map(({ coparentId, childIds }) => {
    const coparentPerson = coparentId ? peopleById.get(coparentId) : undefined;
    const unionRel = coparentId ? findUnionRelationship(relationships, focusId, coparentId) : undefined;
    const coparentRef = coparentPerson
      ? ({
          id: coparentPerson.id,
          treeId,
          name: formatPersonDisplayName(coparentPerson),
          href: buildPersonUrl(treeRef, coparentPerson.id, origin),
          rel: 'spouse' as const,
          relationshipType: unionRel?.type ?? 'marriage',
          relationshipLabel: 'Spouse',
        } satisfies PublicCrawlPersonRef)
      : null;

    const heading = coparentPerson
      ? `Children with ${formatPersonDisplayName(coparentPerson)}`
      : 'Other children';

    return {
      coparent: coparentRef,
      heading,
      familyPageHref: unionRel ? buildFamilyUrl(treeRef, unionRel.id, origin) : null,
      children: childIds
        .map((childId) => childRefById.get(childId))
        .filter((ref): ref is PublicCrawlPersonRef => !!ref),
    };
  });
};

export const enrichSpouseRef = (
  base: PublicCrawlPersonRef,
  unionRel: Relationship,
  treeId: string,
  origin?: string
): PublicCrawlSpouseRef => {
  const unionDate = relationshipDateFromRelationship(unionRel);
  const unionPlace = relationshipPlaceFromRelationship(unionRel);
  return {
    ...base,
    relationshipLabel: formatSpouseRelationshipLabel(unionRel.type, unionDate, unionPlace),
    unionRelationshipId: unionRel.id,
    unionDate: unionDate ?? null,
    unionPlace: unionPlace ?? null,
    familyPageHref: buildFamilyUrl({ id: treeId }, unionRel.id, origin),
  };
};
