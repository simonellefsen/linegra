import { describe, it, expect } from 'vitest';
import { Person, BookChapterFacts, BookGenerationOptions } from '../types';
import { deterministicPersonBiography } from '../services/ai';

const person = (overrides: Partial<Person> & { id: string }): Person => ({
  treeId: 'tree-1',
  firstName: 'Pernille',
  lastName: 'Gether Gamby',
  gender: 'F',
  updatedAt: '2026-06-21T00:00:00Z',
  ...overrides,
});

const opts = (overrides: Partial<BookGenerationOptions> = {}): BookGenerationOptions => ({
  scope: 'all',
  style: 'narrative',
  length: 'medium',
  language: 'da',
  ...overrides,
});

const facts = (overrides: Partial<BookChapterFacts> = {}): BookChapterFacts => ({
  birthYear: 1990,
  ...overrides,
});

describe('deterministicPersonBiography', () => {
  it('does not write about death for a living person', () => {
    const text = deterministicPersonBiography(
      person({ id: 'p1', isLiving: true, birthDate: '1990' }),
      facts({ birthYear: 1990 }),
      opts()
    );
    expect(text).not.toMatch(/død/i);
    expect(text).not.toMatch(/ikke registreret/i);
  });

  it('does say death is unrecorded only when the person is presumed deceased', () => {
    const text = deterministicPersonBiography(
      // born >130 years ago and no death record ⇒ presumed deceased
      person({ id: 'p2', birthDate: '1850', isLiving: false }),
      facts({ birthYear: 1850 }),
      opts()
    );
    expect(text).toMatch(/ikke registreret i arkivet/i);
  });

  it('describes an unmarried partner without saying they married', () => {
    const text = deterministicPersonBiography(
      person({ id: 'p3', birthDate: '1850', isLiving: false }),
      facts({ birthYear: 1850, partnerNames: ['Lasse'] }),
      opts()
    );
    expect(text).toMatch(/levede sammen med Lasse som ugift par/i);
    expect(text).not.toMatch(/giftede sig med Lasse/i);
  });

  it('still describes a formal spouse as married', () => {
    const text = deterministicPersonBiography(
      person({ id: 'p4', birthDate: '1850', isLiving: false }),
      facts({ birthYear: 1850, spouseNames: ['Lasse'] }),
      opts()
    );
    expect(text).toMatch(/giftede sig med Lasse/i);
  });

  it('wraps child names in a single pair of parentheses (no doubling)', () => {
    const text = deterministicPersonBiography(
      person({ id: 'p5', birthDate: '1990', isLiving: true }),
      facts({ birthYear: 1990, childNames: ['Karoline Parkov'] }),
      opts()
    );
    expect(text).toMatch(/\(Karoline Parkov\)/);
    expect(text).not.toMatch(/\(\(/);
  });
});
