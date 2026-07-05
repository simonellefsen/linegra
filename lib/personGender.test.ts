import { describe, expect, it } from 'vitest';
import { inferSpouseDefaultGender } from './personGender';

describe('inferSpouseDefaultGender', () => {
  it('defaults to the opposite sex when known', () => {
    expect(inferSpouseDefaultGender('M')).toBe('F');
    expect(inferSpouseDefaultGender('F')).toBe('M');
  });

  it('returns null when focus sex is unknown', () => {
    expect(inferSpouseDefaultGender('O')).toBeNull();
    expect(inferSpouseDefaultGender(null)).toBeNull();
  });
});
