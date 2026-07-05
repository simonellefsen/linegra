import { describe, expect, it } from 'vitest';
import {
  bestPersonNameMatchScore,
  personNameVariants,
  rankPersonNameMatches,
} from './dnaPersonNameVariants';

describe('dnaPersonNameVariants', () => {
  it('includes married-name aliases in variants and matching', () => {
    const helle = {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Helle',
      last_name: 'Andersen',
      alternate_names: [{ type: 'Married Name', firstName: 'Helle', lastName: 'Due' }],
    };
    expect(personNameVariants(helle)).toContain('Helle Due');
    expect(bestPersonNameMatchScore('Helle Due', helle)).toBeGreaterThanOrEqual(1000);
  });

  it('ranks alias matches above unrelated people', () => {
    const ranked = rankPersonNameMatches('Helle Due', [
      {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Helle',
        last_name: 'Andersen',
        alternate_names: [{ firstName: 'Helle', lastName: 'Due' }],
      },
      { id: '22222222-2222-4222-8222-222222222222', first_name: 'Anna', last_name: 'Due' },
    ]);
    expect(ranked[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
