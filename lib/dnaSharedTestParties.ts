import type { DNATest } from '../types';

export interface SharedAutosomalParty {
  role: 'kit_owner' | 'match';
  personId?: string;
  displayName: string;
}

export interface SharedAutosomalPartyView {
  kitOwner: SharedAutosomalParty;
  match: SharedAutosomalParty;
}

const displayNameForId = (
  personId: string | undefined,
  fallback: string | undefined,
  nameForPersonId?: (id: string) => string | null
): string => {
  if (personId && nameForPersonId) {
    const resolved = nameForPersonId(personId)?.trim();
    if (resolved) return resolved;
  }
  return fallback?.trim() || 'Unknown';
};

/** Resolve kit-owner vs match labels for a shared-segment test on a person profile. */
export const resolveSharedAutosomalParties = (
  test: Pick<
    DNATest,
    'sharedPersonId' | 'sharedMatchPersonId' | 'sharedMatchName' | 'sharedSegmentSummary'
  >,
  nameForPersonId?: (id: string) => string | null
): SharedAutosomalPartyView => {
  const summary = test.sharedSegmentSummary;
  const kitOwner: SharedAutosomalParty = {
    role: 'kit_owner',
    personId: test.sharedPersonId,
    displayName: displayNameForId(test.sharedPersonId, summary?.personName, nameForPersonId),
  };
  const match: SharedAutosomalParty = {
    role: 'match',
    personId: test.sharedMatchPersonId,
    displayName: displayNameForId(
      test.sharedMatchPersonId,
      test.sharedMatchName || summary?.matchName,
      nameForPersonId
    ),
  };

  return { kitOwner, match };
};
