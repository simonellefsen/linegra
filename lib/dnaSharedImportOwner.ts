// K11 — kit-owner selection and FK-trust helpers for shared-segment imports.

import { extractComparisonNamesFromFileName } from './dnaRawParser';
import { scoreNameMatch } from './dnaNameMatch';
import {
  bestPersonNameMatchScore,
  personNameVariants,
  rankPersonNameMatches,
  type DnaPersonNameVariantSource,
} from './dnaPersonNameVariants';

export type SharedImportNameRow = DnaPersonNameVariantSource & { id: string };

export interface SharedSegmentSummaryNames {
  personName: string;
  matchName: string;
  fileName?: string;
}

export const rankPersonMatchesByName = (
  rawName: string | null | undefined,
  candidates: SharedImportNameRow[],
  excludedPersonId?: string
) => rankPersonNameMatches(rawName, candidates, excludedPersonId, 40);

export const suggestKitOwnerPersonId = (
  summary: SharedSegmentSummaryNames,
  candidates: SharedImportNameRow[],
  defaultPersonId?: string | null
): string | null => {
  const rankedPerson = rankPersonMatchesByName(summary.personName, candidates);
  const rankedMatch = rankPersonMatchesByName(summary.matchName, candidates);
  if (summary.fileName) {
    const fileNames = extractComparisonNamesFromFileName(summary.fileName);
    if (fileNames) {
      const [firstName, secondName] = fileNames;
      const firstRank = rankPersonMatchesByName(firstName, candidates);
      const secondRank = rankPersonMatchesByName(secondName, candidates);
      const best = [...firstRank, ...secondRank].sort((left, right) => right.score - left.score)[0];
      if (best && best.normalizedScore >= 60) return best.id;
    }
  }
  const best = [...rankedPerson, ...rankedMatch].sort((left, right) => right.score - left.score)[0];
  if (best && best.normalizedScore >= 60) return best.id;
  if (defaultPersonId && candidates.some((row) => row.id === defaultPersonId)) {
    return defaultPersonId;
  }
  return best?.id ?? defaultPersonId ?? null;
};

export const suggestCounterpartPersonId = (
  summary: SharedSegmentSummaryNames,
  ownerPersonId: string,
  candidates: SharedImportNameRow[]
): string | null => {
  const ownerRow = candidates.find((row) => row.id === ownerPersonId);
  const ownerDisplay = ownerRow ? personNameVariants(ownerRow)[0] || '' : '';
  const personScore = ownerDisplay ? scoreNameMatch(ownerDisplay, summary.personName) : 0;
  const matchScore = ownerDisplay ? scoreNameMatch(ownerDisplay, summary.matchName) : 0;
  const counterpartName =
    personScore >= matchScore ? summary.matchName : summary.personName;
  const ranked = rankPersonMatchesByName(counterpartName, candidates, ownerPersonId);
  const best = ranked[0];
  return best && best.normalizedScore >= 60 ? best.id : null;
};

/** Trust persisted kit-owner / party UUIDs before fuzzy CSV names (K11b). */
export const sharedTestAppliesToFocusPerson = (
  focusPersonId: string,
  ownerPersonId: string | null,
  sharedPersonId: string | null,
  sharedMatchPersonId: string | null
): boolean => {
  if (ownerPersonId === focusPersonId) return true;
  if (sharedPersonId === focusPersonId || sharedMatchPersonId === focusPersonId) return true;
  return false;
};

export const inferCounterpartDisplayName = (
  focusPersonId: string,
  ownerPersonId: string,
  summary: SharedSegmentSummaryNames,
  focusDisplayName: string
): string => {
  if (ownerPersonId === focusPersonId) {
    const personScore = scoreNameMatch(focusDisplayName, summary.personName);
    const matchScore = scoreNameMatch(focusDisplayName, summary.matchName);
    if (personScore >= matchScore) return summary.matchName || summary.personName || 'Unknown match';
    return summary.personName || summary.matchName || 'Unknown match';
  }
  if (scoreNameMatch(focusDisplayName, summary.matchName) >= 60) {
    return summary.personName || summary.matchName || 'Unknown match';
  }
  if (scoreNameMatch(focusDisplayName, summary.personName) >= 60) {
    return summary.matchName || summary.personName || 'Unknown match';
  }
  return summary.matchName || summary.personName || 'Unknown match';
};

const rowDisplayName = (row?: { first_name?: string | null; last_name?: string | null } | null) =>
  row ? [row.first_name, row.last_name].filter(Boolean).join(' ').trim() : '';

/** Display label for the non-focus party in a shared-segment match list row. */
export const resolveSharedMatchCounterpartLabel = (
  focusFullName: string,
  ownerPersonId: string,
  ownerRow: { first_name?: string | null; last_name?: string | null },
  counterpartPersonId: string | null,
  counterpartRow: { first_name?: string | null; last_name?: string | null } | null,
  summary: SharedSegmentSummaryNames,
  staleRpcCounterpartId?: string | null
): string => {
  if (counterpartPersonId && counterpartPersonId === ownerPersonId) {
    const ownerDisplay = rowDisplayName(ownerRow);
    if (ownerDisplay) return ownerDisplay;
  }
  if (
    counterpartPersonId &&
    counterpartRow &&
    (!staleRpcCounterpartId || staleRpcCounterpartId === counterpartPersonId)
  ) {
    const display = rowDisplayName(counterpartRow);
    if (display) return display;
  }
  if (scoreNameMatch(focusFullName, summary.personName) >= 60 && summary.matchName?.trim()) {
    return summary.matchName.trim();
  }
  if (scoreNameMatch(focusFullName, summary.matchName) >= 60 && summary.personName?.trim()) {
    return summary.personName.trim();
  }
  return summary.matchName || summary.personName || rowDisplayName(ownerRow) || 'Unknown';
};

const displayNameForRow = (row: SharedImportNameRow) =>
  [row.first_name, row.last_name].filter(Boolean).join(' ').trim();

export const csvKitOwnerDisplayName = (
  summary: SharedSegmentSummaryNames,
  ownerPersonId: string,
  candidates: SharedImportNameRow[]
): string => {
  const ownerRow = candidates.find((row) => row.id === ownerPersonId);
  const ownerDisplay = ownerRow ? displayNameForRow(ownerRow) : '';
  if (!ownerDisplay) return summary.personName || summary.matchName || 'Unknown';
  const personScore = scoreNameMatch(ownerDisplay, summary.personName);
  const matchScore = scoreNameMatch(ownerDisplay, summary.matchName);
  return personScore >= matchScore
    ? summary.personName || summary.matchName
    : summary.matchName || summary.personName;
};

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const shouldOfferMarriedNameAlias = (
  summary: SharedSegmentSummaryNames,
  ownerPersonId: string,
  candidates: SharedImportNameRow[],
  csvOwnerName: string
): boolean => {
  const ownerRow = candidates.find((row) => row.id === ownerPersonId);
  if (!ownerRow || !csvOwnerName?.trim()) return false;
  const treeVariants = personNameVariants(ownerRow).map(normalizeName);
  const csvNormalized = normalizeName(csvOwnerName);
  if (treeVariants.includes(csvNormalized)) return false;
  const score = bestPersonNameMatchScore(csvOwnerName, ownerRow);
  return score >= 40 && score < 1000;
};
