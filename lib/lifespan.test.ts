import { describe, it, expect } from 'vitest';
import { extractBirthYear, isImplausiblyOld, inferLivingStatus, MAX_PLAUSIBLE_AGE } from './lifespan';

const NOW = new Date('2026-06-20T00:00:00Z');

describe('extractBirthYear', () => {
  it('pulls the first 4-digit year from fuzzy date strings', () => {
    expect(extractBirthYear('ABT 1807')).toBe(1807);
    expect(extractBirthYear('12 MAR 1850')).toBe(1850);
    expect(extractBirthYear('1923')).toBe(1923);
    expect(extractBirthYear('BET 1800 AND 1805')).toBe(1800);
  });

  it('returns null when there is no year', () => {
    expect(extractBirthYear('')).toBeNull();
    expect(extractBirthYear(undefined)).toBeNull();
    expect(extractBirthYear('unknown')).toBeNull();
  });
});

describe('isImplausiblyOld', () => {
  it('flags ages beyond the max plausible lifespan', () => {
    expect(isImplausiblyOld('ABT 1807', NOW)).toBe(true); // ~219 years
    expect(isImplausiblyOld('1850', NOW)).toBe(true);
  });

  it('does not flag plausible or unknown ages', () => {
    expect(isImplausiblyOld('1950', NOW)).toBe(false);
    expect(isImplausiblyOld(`${2026 - MAX_PLAUSIBLE_AGE}`, NOW)).toBe(false); // exactly max age
    expect(isImplausiblyOld(undefined, NOW)).toBe(false);
  });
});

describe('inferLivingStatus', () => {
  it('marks an implausibly old person (birth, no death) as deceased', () => {
    expect(inferLivingStatus({ birthDate: 'ABT 1807' }, NOW)).toBe(false);
  });

  it('treats a recorded death or burial as deceased even if isLiving was true', () => {
    expect(inferLivingStatus({ birthDate: '1950', deathDate: '2000', isLiving: true }, NOW)).toBe(false);
    expect(inferLivingStatus({ birthDate: '1950', burialDate: '2001' }, NOW)).toBe(false);
  });

  it('keeps a plausibly-aged person with no death as living', () => {
    expect(inferLivingStatus({ birthDate: '1990' }, NOW)).toBe(true);
    expect(inferLivingStatus({}, NOW)).toBe(true); // unknown birth, no death
  });

  it('respects an explicit isLiving flag when age is plausible and no death', () => {
    expect(inferLivingStatus({ birthDate: '1990', isLiving: false }, NOW)).toBe(false);
    expect(inferLivingStatus({ birthDate: '1990', isLiving: true }, NOW)).toBe(true);
  });
});
