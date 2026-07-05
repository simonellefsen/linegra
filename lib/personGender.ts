import type { Person } from '../types';

/** Default gender for a new spouse/partner based on the focus person's sex. */
export const inferSpouseDefaultGender = (
  focusGender: Person['gender'] | null | undefined
): 'M' | 'F' | null => {
  if (focusGender === 'M') return 'F';
  if (focusGender === 'F') return 'M';
  return null;
};
