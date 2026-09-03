import { scoreNameMatch } from './dnaNameMatch';
import { applyFileNameComparisonNames } from './dnaRawParser';
import {
  suggestKitOwnerPersonId,
  type SharedImportNameRow,
  type SharedSegmentSummaryNames,
} from './dnaSharedImportOwner';
import type { DNATest } from '../types';

export interface SharedAutosomalParty {
  role: 'kit_owner' | 'match';
  personId?: string;
  displayName: string;
}

export interface SharedAutosomalPartyView {
  kitOwner: SharedAutosomalParty;
  match: SharedAutosomalParty;
  suggestedKitOwnerPersonId: string | null;
}

const displayNameForRow = (row: SharedImportNameRow) =>
  [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

const displayNameForId = (
  personId: string | undefined,
  fallback: string | undefined,
  treePeople: SharedImportNameRow[]
): string => {
  if (personId) {
    const row = treePeople.find((entry) => entry.id === personId);
    if (row) {
      const resolved = displayNameForRow(row);
      if (resolved) return resolved;
    }
  }
  return fallback?.trim() || 'Unknown';
};

const viewerMatchesName = (
  viewingPersonId: string,
  rawName: string | undefined,
  treePeople: SharedImportNameRow[]
): boolean => {
  if (!rawName?.trim()) return false;
  const viewerRow = treePeople.find((entry) => entry.id === viewingPersonId);
  if (!viewerRow) return false;
  const viewerNames = [displayNameForRow(viewerRow)];
  return viewerNames.some((name) => name && scoreNameMatch(name, rawName) >= 60);
};

export const suggestSharedAutosomalKitOwnerId = (
  viewingPersonId: string,
  test: Pick<DNATest, 'sharedMatchPersonId' | 'sharedSegmentSummary'>,
  treePeople: SharedImportNameRow[]
): string | null => {
  const summary = test.sharedSegmentSummary;
  if (!summary) return null;
  const excluded = new Set(
    [viewingPersonId, test.sharedMatchPersonId].filter(
      (id): id is string => typeof id === 'string' && !!id
    )
  );
  const candidates = treePeople.filter((row) => !excluded.has(row.id));
  const names: SharedSegmentSummaryNames = {
    personName: summary.personName,
    matchName: summary.matchName,
    fileName: summary.fileName,
  };
  return suggestKitOwnerPersonId(names, candidates);
};

/**
 * Resolve kit-owner vs match for one shared-segment test.
 * Each test carries its own owner UUID (supports multiple imports per match person).
 * CSV names can suggest a party only when that UUID has not been set.
 */
export const resolveSharedAutosomalParties = (
  viewingPersonId: string,
  test: Pick<
    DNATest,
    'sharedPersonId' | 'sharedMatchPersonId' | 'sharedMatchName' | 'sharedSegmentSummary'
  >,
  treePeople: SharedImportNameRow[]
): SharedAutosomalPartyView => {
  const summary = test.sharedSegmentSummary;
  const isFtdnaComparison = summary?.importFormat === 'FTDNA_COMPARISON_SEGMENTS';
  const normalizedNames = summary?.fileName
    ? applyFileNameComparisonNames(
        summary.fileName,
        summary.personName,
        summary.matchName,
        isFtdnaComparison
      )
    : { personName: summary?.personName, matchName: summary?.matchName };
  const personName = normalizedNames.personName;
  const matchName = test.sharedMatchName || normalizedNames.matchName;
  const suggestedKitOwnerPersonId = suggestSharedAutosomalKitOwnerId(viewingPersonId, test, treePeople);

  const viewerIsKitOwner =
    test.sharedPersonId === viewingPersonId || viewerMatchesName(viewingPersonId, personName, treePeople);
  const viewerIsMatch =
    test.sharedMatchPersonId === viewingPersonId || viewerMatchesName(viewingPersonId, matchName, treePeople);

  let kitOwnerId = test.sharedPersonId;
  let matchPersonId = test.sharedMatchPersonId;

  if (!kitOwnerId) {
    kitOwnerId = suggestedKitOwnerPersonId ?? undefined;
  }

  if (!kitOwnerId) {
    if (viewerIsMatch && personName) {
      kitOwnerId =
        treePeople.find(
          (row) =>
            row.id !== viewingPersonId && scoreNameMatch(displayNameForRow(row), personName) >= 60
        )?.id ?? undefined;
    } else if (viewerIsKitOwner) {
      kitOwnerId = viewingPersonId;
    }
  }

  if (!matchPersonId) {
    if (viewerIsKitOwner && matchName) {
      matchPersonId =
        treePeople.find(
          (row) =>
            row.id !== viewingPersonId && scoreNameMatch(displayNameForRow(row), matchName) >= 60
        )?.id ?? undefined;
    } else if (viewerIsMatch) {
      matchPersonId = viewingPersonId;
    }
  }

  const kitOwner: SharedAutosomalParty = {
    role: 'kit_owner',
    personId: kitOwnerId,
    displayName: displayNameForId(kitOwnerId, personName, treePeople),
  };
  const match: SharedAutosomalParty = {
    role: 'match',
    personId: matchPersonId,
    displayName: displayNameForId(matchPersonId, matchName, treePeople),
  };

  return { kitOwner, match, suggestedKitOwnerPersonId };
};
