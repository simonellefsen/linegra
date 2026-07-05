import { describe, expect, it } from 'vitest';
import { buildPersonSlugSegment, parsePersonIdPrefix, slugifyTreeName } from './publicSlugs';

const PERSON = '4a1b9c2e-aaaa-4bbb-8bbb-bbbbbbbbbbbb';

describe('publicSlugs', () => {
  it('slugifies Danish tree names', () => {
    expect(slugifyTreeName('Gether-Gamby')).toBe('gether-gamby');
    expect(slugifyTreeName('Hass-Jensen')).toBe('hass-jensen');
    expect(slugifyTreeName('Gøth-Tunsted')).toBe('goeth-tunsted');
  });

  it('builds person slug segments with id8 suffix', () => {
    expect(
      buildPersonSlugSegment({
        id: PERSON,
        firstName: 'Anna',
        lastName: 'Hansdatter',
        birthDate: '3 MAR 1832',
      })
    ).toBe('anna-hansdatter-1832-4a1b9c2e');
    expect(parsePersonIdPrefix('anna-hansdatter-1832-4a1b9c2e')).toBe('4a1b9c2e');
  });
});
