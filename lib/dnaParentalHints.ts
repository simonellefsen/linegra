// Parental-side and Leeds grandparent hints from tree paths (no phased DNA required).
//
// These are *hints* derived from documented relationships — not proof of which chromosome
// copy a segment sits on. Unphased owner-side segments can still false-cluster across sides.

import type { Person, Relationship, RelationshipType } from '../types';

const BIO_MOTHER: RelationshipType = 'bio_mother';
const BIO_FATHER: RelationshipType = 'bio_father';

export type ParentalSideHint = 'maternal' | 'paternal' | 'unknown';

export interface GrandparentSlot {
  key: 'mgf' | 'mgm' | 'pgf' | 'pgm';
  personId: string;
  label: string;
}

export interface BioParents {
  motherId?: string;
  fatherId?: string;
}

export const getBioParents = (childId: string, relationships: Relationship[]): BioParents => {
  const result: BioParents = {};
  for (const rel of relationships) {
    if (rel.relatedId !== childId) continue;
    if (rel.type === BIO_MOTHER) result.motherId = rel.personId;
    if (rel.type === BIO_FATHER) result.fatherId = rel.personId;
  }
  return result;
};

const displayName = (person: Person | undefined): string => {
  if (!person) return 'Unknown';
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
};

/** Up to four biological grandparents of `testerId`, when the tree documents them. */
export const resolveGrandparentSlots = (
  testerId: string,
  relationships: Relationship[],
  peopleById: Map<string, Person>
): GrandparentSlot[] => {
  const { motherId, fatherId } = getBioParents(testerId, relationships);
  const slots: GrandparentSlot[] = [];

  const addMaternal = (personId: string, key: 'mgf' | 'mgm') => {
    slots.push({ key, personId, label: displayName(peopleById.get(personId)) });
  };
  const addPaternal = (personId: string, key: 'pgf' | 'pgm') => {
    slots.push({ key, personId, label: displayName(peopleById.get(personId)) });
  };

  if (motherId) {
    const maternalGrandparents = getBioParents(motherId, relationships);
    if (maternalGrandparents.fatherId) addMaternal(maternalGrandparents.fatherId, 'mgf');
    if (maternalGrandparents.motherId) addMaternal(maternalGrandparents.motherId, 'mgm');
  }
  if (fatherId) {
    const paternalGrandparents = getBioParents(fatherId, relationships);
    if (paternalGrandparents.fatherId) addPaternal(paternalGrandparents.fatherId, 'pgf');
    if (paternalGrandparents.motherId) addPaternal(paternalGrandparents.motherId, 'pgm');
  }

  return slots;
};

/**
 * Which parental line the documented path leaves the tester on (first hop).
 * Returns unknown when parents are missing or the path touches both sides.
 */
export const inferPathParentalSide = (
  pathPersonIds: string[],
  testerId: string,
  relationships: Relationship[]
): ParentalSideHint => {
  if (!pathPersonIds.length) return 'unknown';
  const { motherId, fatherId } = getBioParents(testerId, relationships);
  if (!motherId && !fatherId) return 'unknown';

  const touchesMother = !!motherId && pathPersonIds.includes(motherId);
  const touchesFather = !!fatherId && pathPersonIds.includes(fatherId);
  if (touchesMother && !touchesFather) return 'maternal';
  if (touchesFather && !touchesMother) return 'paternal';
  return 'unknown';
};

/** Leeds-style bucket: which documented grandparent appears on the path. */
export const inferPathGrandparentSlot = (
  pathPersonIds: string[],
  slots: GrandparentSlot[]
): GrandparentSlot | null => {
  if (!pathPersonIds.length || !slots.length) return null;
  const pathSet = new Set(pathPersonIds);
  for (const slot of slots) {
    if (pathSet.has(slot.personId)) return slot;
  }
  return null;
};

export const grandparentSlotShortLabel = (key: GrandparentSlot['key']): string => {
  switch (key) {
    case 'mgf':
      return "Mother's father";
    case 'mgm':
      return "Mother's mother";
    case 'pgf':
      return "Father's father";
    case 'pgm':
      return "Father's mother";
    default:
      return 'Grandparent';
  }
};
