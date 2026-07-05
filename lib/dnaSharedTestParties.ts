import { scoreNameMatch } from './dnaNameMatch';
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

const viewerMatchesName = (
  viewingPersonId: string,
  rawName: string | undefined,
  nameForPersonId?: (id: string) => string | null,
  resolveNameToPersonId?: (name: string, excludePersonId?: string) => string | null
): boolean => {
  if (!rawName?.trim()) return false;
  const viewerName = nameForPersonId?.(viewingPersonId)?.trim();
  if (viewerName && scoreNameMatch(viewerName, rawName) >= 60) return true;
  const resolvedId = resolveNameToPersonId?.(rawName, viewingPersonId);
  return resolvedId === viewingPersonId;
};

/**
 * Resolve kit-owner vs match for one shared-segment test.
 * Each test carries its own owner (supports multiple imports per match person).
 */
export const resolveSharedAutosomalParties = (
  viewingPersonId: string,
  test: Pick<
    DNATest,
    'sharedPersonId' | 'sharedMatchPersonId' | 'sharedMatchName' | 'sharedSegmentSummary'
  >,
  nameForPersonId?: (id: string) => string | null,
  resolveNameToPersonId?: (name: string, excludePersonId?: string) => string | null
): SharedAutosomalPartyView => {
  const summary = test.sharedSegmentSummary;
  const personName = summary?.personName;
  const matchName = test.sharedMatchName || summary?.matchName;

  const viewerIsKitOwner =
    test.sharedPersonId === viewingPersonId ||
    viewerMatchesName(viewingPersonId, personName, nameForPersonId, resolveNameToPersonId);
  const viewerIsMatch =
    test.sharedMatchPersonId === viewingPersonId ||
    viewerMatchesName(viewingPersonId, matchName, nameForPersonId, resolveNameToPersonId);

  let kitOwnerId = test.sharedPersonId;
  let matchPersonId = test.sharedMatchPersonId;

  if (!kitOwnerId) {
    if (viewerIsMatch && personName) {
      kitOwnerId = resolveNameToPersonId?.(personName, viewingPersonId) ?? undefined;
    } else if (viewerIsKitOwner) {
      kitOwnerId = viewingPersonId;
    } else if (personName) {
      kitOwnerId = resolveNameToPersonId?.(personName, viewingPersonId) ?? undefined;
    }
  }

  if (!matchPersonId) {
    if (viewerIsKitOwner && matchName) {
      matchPersonId = resolveNameToPersonId?.(matchName, viewingPersonId) ?? undefined;
    } else if (viewerIsMatch) {
      matchPersonId = viewingPersonId;
    } else if (matchName) {
      matchPersonId = resolveNameToPersonId?.(matchName, viewingPersonId) ?? undefined;
    }
  }

  const kitOwner: SharedAutosomalParty = {
    role: 'kit_owner',
    personId: kitOwnerId,
    displayName: displayNameForId(kitOwnerId, personName, nameForPersonId),
  };
  const match: SharedAutosomalParty = {
    role: 'match',
    personId: matchPersonId,
    displayName: displayNameForId(matchPersonId, matchName, nameForPersonId),
  };

  return { kitOwner, match };
};
