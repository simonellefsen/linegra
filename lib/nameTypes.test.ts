import { describe, it, expect } from 'vitest';
import { gedcomNameTypeToAlternate, alternateTypeToGedcomNameType } from './nameTypes';

describe('gedcomNameTypeToAlternate', () => {
  it('maps GEDCOM 7 NAME.TYPE keywords', () => {
    expect(gedcomNameTypeToAlternate('aka')).toBe('Also Known As');
    expect(gedcomNameTypeToAlternate('birth')).toBe('Birth Name');
    expect(gedcomNameTypeToAlternate('maiden')).toBe('Birth Name');
    expect(gedcomNameTypeToAlternate('married')).toBe('Married Name');
    expect(gedcomNameTypeToAlternate('immigrant')).toBe('Anglicized Name');
    expect(gedcomNameTypeToAlternate('name-changed')).toBe('Legal Name Change');
    expect(gedcomNameTypeToAlternate('nickname')).toBe('Nickname');
    expect(gedcomNameTypeToAlternate('religious')).toBe('Religious Name');
  });

  it('is case-insensitive and trims', () => {
    expect(gedcomNameTypeToAlternate(' MARRIED ')).toBe('Married Name');
    expect(gedcomNameTypeToAlternate('Married')).toBe('Married Name');
  });

  it('falls back to "Also Known As" for unknown/empty', () => {
    expect(gedcomNameTypeToAlternate('otherwise')).toBe('Also Known As');
    expect(gedcomNameTypeToAlternate('something weird')).toBe('Also Known As');
    expect(gedcomNameTypeToAlternate('')).toBe('Also Known As');
  });
});

describe('alternateTypeToGedcomNameType', () => {
  it('round-trips every alternate type to a GEDCOM keyword and back', () => {
    const types = [
      'Also Known As',
      'Birth Name',
      'Nickname',
      'Alias',
      'Married Name',
      'Anglicized Name',
      'Legal Name Change',
      'Religious Name',
    ] as const;
    for (const t of types) {
      const ged = alternateTypeToGedcomNameType(t);
      expect(gedcomNameTypeToAlternate(ged)).toBe(t);
    }
  });
});
