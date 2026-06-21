import { describe, it, expect } from 'vitest';
import { deterministicParsePlace, mergeStructuredPlace } from './placeParser';

describe('deterministicParsePlace', () => {
  it('always returns the trimmed fullText', () => {
    expect(deterministicParsePlace('  Copenhagen  ').fullText).toBe('Copenhagen');
    expect(deterministicParsePlace('').fullText).toBe('');
  });

  it('treats a single token as a place name', () => {
    expect(deterministicParsePlace('Gamby')).toEqual({ fullText: 'Gamby', placeName: 'Gamby' });
  });

  it('maps "City, Country"', () => {
    expect(deterministicParsePlace('Copenhagen, Denmark')).toMatchObject({
      city: 'Copenhagen',
      country: 'Denmark',
    });
  });

  it('maps "City, State, Country"', () => {
    expect(deterministicParsePlace('Springfield, Illinois, USA')).toMatchObject({
      city: 'Springfield',
      state: 'Illinois',
      country: 'USA',
    });
  });

  it('maps "City, County, State, Country"', () => {
    expect(deterministicParsePlace('Odense, Funen, Region of Southern Denmark, Denmark')).toMatchObject({
      city: 'Odense',
      county: 'Funen',
      state: 'Region of Southern Denmark',
      country: 'Denmark',
    });
  });

  it('extracts a street + house number from a 5+ part address', () => {
    const result = deterministicParsePlace('Hovedgaden 12B, Odense, Funen, Southern Denmark, Denmark');
    expect(result).toMatchObject({
      street: 'Hovedgaden',
      houseNumber: '12B',
      city: 'Odense',
      county: 'Funen',
      state: 'Southern Denmark',
      country: 'Denmark',
    });
  });

  it('keeps the lead as a street when there is no house number', () => {
    const result = deterministicParsePlace('Main Street, Boston, Suffolk, Massachusetts, USA');
    expect(result.street).toBe('Main Street');
    expect(result.houseNumber).toBeUndefined();
    expect(result.country).toBe('USA');
  });

  it('classifies the Danish administrative hierarchy by keyword (sogn/herred/amt)', () => {
    const result = deterministicParsePlace(
      'Rosengade, Brædstrup, Ring Sogn, Tyrsting Herred, Skanderborg Amt, Danmark'
    );
    expect(result).toMatchObject({
      street: 'Rosengade',
      city: 'Brædstrup',
      parish: 'Ring Sogn',
      hundred: 'Tyrsting Herred',
      county: 'Skanderborg Amt',
      country: 'Danmark',
    });
  });

  it('recognizes kommune as hundred and region as state', () => {
    const result = deterministicParsePlace('Vesterbro, Aalborg, Budolfi Sogn, Aalborg Kommune, Region Nordjylland, Danmark');
    expect(result).toMatchObject({
      street: 'Vesterbro',
      city: 'Aalborg',
      parish: 'Budolfi Sogn',
      hundred: 'Aalborg Kommune',
      state: 'Region Nordjylland',
      country: 'Danmark',
    });
  });

  it('splits a street + house number even with the full hierarchy', () => {
    const result = deterministicParsePlace('Hovedgaden 12B, Brædstrup, Ring Sogn, Tyrsting Herred, Skanderborg Amt, Danmark');
    expect(result).toMatchObject({
      street: 'Hovedgaden',
      houseNumber: '12B',
      parish: 'Ring Sogn',
      hundred: 'Tyrsting Herred',
    });
  });
});

describe('mergeStructuredPlace', () => {
  it('lets the primary (AI) value win where present', () => {
    const fallback = { fullText: 'x', city: 'Odense', country: 'Denmark' };
    const primary = { city: 'Odense C', zip: '5000' };
    const merged = mergeStructuredPlace(fallback, primary, 'x');
    expect(merged.city).toBe('Odense C'); // primary wins
    expect(merged.country).toBe('Denmark'); // backfilled from fallback
    expect(merged.zip).toBe('5000');
  });

  it('backfills from the fallback when the primary field is empty/missing', () => {
    const fallback = { fullText: 'x', city: 'Odense', state: 'Funen' };
    const primary = { city: '   ', country: 'Denmark' };
    const merged = mergeStructuredPlace(fallback, primary, 'x');
    expect(merged.city).toBe('Odense'); // blank primary ignored, fallback used
    expect(merged.state).toBe('Funen');
    expect(merged.country).toBe('Denmark');
  });

  it('forces fullText to the canonical trimmed input', () => {
    const merged = mergeStructuredPlace({ fullText: 'old' }, { fullText: 'other' }, '  canonical  ');
    expect(merged.fullText).toBe('canonical');
  });

  it('preserves finite coordinates from either side', () => {
    const merged = mergeStructuredPlace({ fullText: 'x', lat: 55.4 }, { lng: 10.4 }, 'x');
    expect(merged.lat).toBe(55.4);
    expect(merged.lng).toBe(10.4);
  });
});
