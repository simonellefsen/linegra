import { describe, expect, it } from 'vitest';
import {
  inferCounterpartDisplayName,
  sharedTestAppliesToFocusPerson,
  suggestKitOwnerPersonId,
} from './dnaSharedImportOwner';

const helle = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Helle',
  last_name: 'Andersen',
  maiden_name: null,
};

const ulla = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Ulla',
  last_name: 'Thøgersen',
  maiden_name: null,
};

describe('dnaSharedImportOwner', () => {
  it('trusts kit-owner person_id before CSV names', () => {
    expect(
      sharedTestAppliesToFocusPerson(
        helle.id,
        helle.id,
        null,
        null
      )
    ).toBe(true);
    expect(
      sharedTestAppliesToFocusPerson(
        helle.id,
        ulla.id,
        null,
        null
      )
    ).toBe(false);
  });

  it('suggests owner from filename when tree name differs from CSV married name', () => {
    const ownerId = suggestKitOwnerPersonId(
      {
        personName: 'Helle Due',
        matchName: 'Ruben Lykke Pedersen',
        fileName: 'Shared DNA segments of Helle Due and Ruben Lykke Pedersen.csv',
      },
      [helle, ulla],
      helle.id
    );
    expect(ownerId).toBe(helle.id);
  });

  it('labels unlinked counterpart from CSV when owner is focus', () => {
    expect(
      inferCounterpartDisplayName(helle.id, helle.id, {
        personName: 'Helle Due',
        matchName: 'Ruben Lykke Pedersen',
      }, 'Helle Andersen')
    ).toBe('Ruben Lykke Pedersen');
  });
});
