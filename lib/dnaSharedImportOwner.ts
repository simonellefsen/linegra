// K11 — kit-owner selection and FK-trust helpers for shared-segment imports.

import { extractComparisonNamesFromFileName } from './dnaRawParser';
import { scoreNameMatch } from './dnaNameMatch';

export interface SharedImportNameRow {
  id: string;
  first_name: string;
  last_name: string | null;
  maiden_name?: string | null;
}

export interface SharedSegmentSummaryNames {
  personName: string;
  matchName: string;
  fileName?: string;
}

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const displayNameForRow = (row: SharedImportNameRow) =>
  `${row.first_name || ''} ${row.last_name || ''}`.trim();

const maidenDisplayNameForRow = (row: SharedImportNameRow) =>
  row.maiden_name?.trim() ? `${row.first_name || ''} ${row.maiden_name}`.trim() : '';

const bestNameScore = (input: string, row: SharedImportNameRow) => {
  const scores = [scoreNameMatch(input, displayNameForRow(row))];
  const maiden = maidenDisplayNameForRow(row);
  if (maiden) scores.push(scoreNameMatch(input, maiden));
  return Math.max(...scores);
};

export const rankPersonMatchesByName = (
  rawName: string | null | undefined,
  candidates: SharedImportNameRow[],
  excludedPersonId?: string
) => {
  const input = normalizeName(rawName);
  if (!input) return [];
  return candidates
    .filter((candidate) => !(excludedPersonId && candidate.id === excludedPersonId))
    .map((candidate) => ({
      id: candidate.id,
      displayName: displayNameForRow(candidate),
      score: bestNameScore(input, candidate),
    }))
    .filter((row) => row.score >= 40)
    .sort((left, right) => right.score - left.score);
};

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
      if (best && best.score >= 60) return best.id;
    }
  }
  const best = [...rankedPerson, ...rankedMatch].sort((left, right) => right.score - left.score)[0];
  if (best && best.score >= 60) return best.id;
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
  const ownerDisplay = ownerRow ? displayNameForRow(ownerRow) : '';
  const personScore = ownerDisplay ? scoreNameMatch(ownerDisplay, summary.personName) : 0;
  const matchScore = ownerDisplay ? scoreNameMatch(ownerDisplay, summary.matchName) : 0;
  const counterpartName =
    personScore >= matchScore ? summary.matchName : summary.personName;
  const ranked = rankPersonMatchesByName(counterpartName, candidates, ownerPersonId);
  const best = ranked[0];
  return best && best.score >= 60 ? best.id : null;
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
  const ownerRowName = summary.personName || summary.matchName;
  if (scoreNameMatch(focusDisplayName, summary.matchName) >= 60) return summary.personName || ownerRowName;
  if (scoreNameMatch(focusDisplayName, summary.personName) >= 60) return summary.matchName || ownerRowName;
  return summary.matchName || summary.personName || 'Unknown match';
};

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

export const shouldOfferMarriedNameAlias = (
  summary: SharedSegmentSummaryNames,
  ownerPersonId: string,
  candidates: SharedImportNameRow[],
  csvOwnerName: string
): boolean => {
  const ownerRow = candidates.find((row) => row.id === ownerPersonId);
  if (!ownerRow || !csvOwnerName?.trim()) return false;
  const treeName = displayNameForRow(ownerRow);
  const maiden = maidenDisplayNameForRow(ownerRow);
  if (normalizeName(csvOwnerName) === normalizeName(treeName)) return false;
  if (maiden && normalizeName(csvOwnerName) === normalizeName(maiden)) return false;
  return scoreNameMatch(treeName, csvOwnerName) >= 40 && scoreNameMatch(treeName, csvOwnerName) < 85;
};
