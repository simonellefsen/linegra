import type { Person, Relationship, RelationshipType } from '../types';

const TYPED_PARENT_LINKS: RelationshipType[] = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
];

export const isTypedParentLink = (type: RelationshipType): boolean =>
  TYPED_PARENT_LINKS.includes(type);

export const isParentChildEdge = (rel: Relationship): boolean =>
  isTypedParentLink(rel.type) || rel.type === 'child';

/** Prefer bio_father / bio_mother from parent gender; fall back to generic child. */
export const inferParentRelationshipType = (gender: Person['gender'] | null | undefined): RelationshipType => {
  if (gender === 'M') return 'bio_father';
  if (gender === 'F') return 'bio_mother';
  return 'child';
};

export interface ParentChildLinkIndex {
  parentLinksByChild: Map<string, Relationship[]>;
  childLinksByParent: Map<string, Relationship[]>;
}

export const indexParentChildLinks = (relationships: Relationship[]): ParentChildLinkIndex => {
  const parentLinksByChild = new Map<string, Relationship[]>();
  const childLinksByParent = new Map<string, Relationship[]>();

  const push = (map: Map<string, Relationship[]>, key: string, rel: Relationship) => {
    map.set(key, [...(map.get(key) || []), rel]);
  };

  relationships.forEach((rel) => {
    if (!isParentChildEdge(rel)) return;
    push(parentLinksByChild, rel.relatedId, rel);
    push(childLinksByParent, rel.personId, rel);
  });

  return { parentLinksByChild, childLinksByParent };
};

export const parentLinkReadsAsFather = (rel: Relationship, parent?: Person | null): boolean => {
  if (rel.type === 'bio_father' || rel.type === 'adoptive_father') return true;
  if (rel.type === 'child') return parent?.gender === 'M';
  return false;
};

export const parentLinkReadsAsMother = (rel: Relationship, parent?: Person | null): boolean => {
  if (rel.type === 'bio_mother' || rel.type === 'adoptive_mother') return true;
  if (rel.type === 'child') return parent?.gender === 'F';
  return false;
};

export interface ParentLinkForUnion {
  parentId: string;
  type: RelationshipType;
  gender?: Person['gender'] | null;
}

export interface ParentLinkRef {
  parentId: string;
  type: RelationshipType;
}

export const childHasTypedParentRole = (
  links: ParentLinkRef[],
  role: 'bio_father' | 'bio_mother',
  exceptParentId?: string
): boolean =>
  links.some((link) => link.type === role && (!exceptParentId || link.parentId !== exceptParentId));

/** Do not auto-link a coparent when the child already has that biological parent role filled. */
export const shouldSkipCoparentChildLink = (
  existingLinks: ParentLinkRef[],
  parentId: string,
  parentGender: Person['gender'] | null
): boolean => {
  const targetType = inferParentRelationshipType(parentGender);
  if (targetType === 'bio_father') {
    return childHasTypedParentRole(existingLinks, 'bio_father', parentId);
  }
  if (targetType === 'bio_mother') {
    return childHasTypedParentRole(existingLinks, 'bio_mother', parentId);
  }
  return false;
};

/** Father–mother pairs that should share a spousal union when linked to the same child. */
export const inferParentPairsForUnion = (links: ParentLinkForUnion[]): Array<[string, string]> => {
  const fathers: string[] = [];
  const mothers: string[] = [];
  links.forEach((link) => {
    const rel = { type: link.type } as Relationship;
    const parent = { gender: link.gender ?? null } as Person;
    if (parentLinkReadsAsFather(rel, parent)) {
      if (!fathers.includes(link.parentId)) fathers.push(link.parentId);
      return;
    }
    if (parentLinkReadsAsMother(rel, parent)) {
      if (!mothers.includes(link.parentId)) mothers.push(link.parentId);
    }
  });
  const pairs: Array<[string, string]> = [];
  fathers.forEach((fatherId) => {
    mothers.forEach((motherId) => {
      if (fatherId !== motherId) pairs.push([fatherId, motherId]);
    });
  });
  return pairs;
};
