// Common-sense living/deceased inference.
//
// Genealogy records frequently have a birth year but no recorded death/burial — that does NOT
// mean the person is alive. If the birth year implies an implausibly old age, treat them as
// deceased. Pure and dependency-free so it can be reused at import time and in the UI, and tested.

import { dateYear } from './gedcomDate';

export const MAX_PLAUSIBLE_AGE = 130;

/** Representative year from a fuzzy genealogical date string (e.g. "ABT 1807", "12 MAR 1850",
 *  "BET 1800 AND 1805"). Delegates to the lossless structured-date parser (lib/gedcomDate.ts); for
 *  ranges it returns the START year, preserving this helper's long-standing behavior, while now also
 *  understanding qualifiers, BCE, and calendars (roadmap H/P1). BCE years are negative. */
export const extractBirthYear = (value?: string | null): number | null => dateYear(value);

/** True if the birth year implies an age beyond a plausible human lifespan. */
export const isImplausiblyOld = (
  birthDate?: string | null,
  now: Date = new Date(),
  maxAge: number = MAX_PLAUSIBLE_AGE,
): boolean => {
  const year = extractBirthYear(birthDate);
  if (year == null) return false;
  return now.getFullYear() - year > maxAge;
};

export interface LivingInputs {
  birthDate?: string | null;
  deathDate?: string | null;
  burialDate?: string | null;
  isLiving?: boolean;
}

/**
 * Decide whether a person should be shown as living. A recorded death/burial, or an
 * implausibly old birth year, means deceased — regardless of any stale `isLiving` flag. Otherwise
 * an explicit flag wins, and the default (birth known/unknown, no death) is living.
 */
export const inferLivingStatus = (person: LivingInputs, now: Date = new Date()): boolean => {
  if (person.deathDate || person.burialDate) return false;
  if (isImplausiblyOld(person.birthDate, now)) return false;
  if (typeof person.isLiving === 'boolean') return person.isLiving;
  return true;
};
