// K11 — collect display / maiden / alternate name variants for DNA name matching.

import { normalizeNameMatchScore, scoreNameMatch } from './dnaNameMatch';

export interface DnaPersonNameVariantSource {
  first_name?: string | null;
  last_name?: string | null;
  maiden_name?: string | null;
  alternate_names?: Array<{
    type?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  }> | null;
}

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(' ').trim();

export const personNameVariants = (row: DnaPersonNameVariantSource): string[] => {
  const variants = new Set<string>();
  const display = fullName(row.first_name, row.last_name);
  if (display) variants.add(display);
  const maiden = fullName(row.first_name, row.maiden_name);
  if (maiden) variants.add(maiden);
  (row.alternate_names || []).forEach((alt) => {
    const altName = fullName(alt.firstName ?? alt.first_name, alt.lastName ?? alt.last_name);
    if (altName) variants.add(altName);
  });
  return [...variants];
};

export const bestPersonNameMatchScore = (
  rawName: string | null | undefined,
  row: DnaPersonNameVariantSource
): number => {
  const variants = personNameVariants(row);
  if (!variants.length) return 0;
  return Math.max(...variants.map((variant) => scoreNameMatch(rawName || '', variant)));
};

export const alternateNamesFromPersonMetadata = (
  metadata: unknown
): NonNullable<DnaPersonNameVariantSource['alternate_names']> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const record = metadata as Record<string, unknown>;
  const raw = record.alternateNames ?? record.alternate_names;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object') as NonNullable<
    DnaPersonNameVariantSource['alternate_names']
  >;
};

export const mapDbRowToNameLookup = (row: {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  maiden_name?: string | null;
  metadata?: unknown;
}) => ({
  id: row.id,
  first_name: row.first_name || '',
  last_name: row.last_name || null,
  maiden_name: row.maiden_name || null,
  alternate_names: alternateNamesFromPersonMetadata(row.metadata),
});

export const rankPersonNameMatches = (
  rawName: string | null | undefined,
  candidates: Array<DnaPersonNameVariantSource & { id: string }>,
  excludedPersonId?: string,
  minNormalizedScore = 40
) => {
  const input = rawName?.trim();
  if (!input) return [];
  return candidates
    .filter((candidate) => !(excludedPersonId && candidate.id === excludedPersonId))
    .map((candidate) => ({
      id: candidate.id,
      displayName: fullName(candidate.first_name, candidate.last_name) || candidate.id,
      score: bestPersonNameMatchScore(input, candidate),
      normalizedScore: normalizeNameMatchScore(bestPersonNameMatchScore(input, candidate)),
    }))
    .filter((row) => row.normalizedScore >= minNormalizedScore)
    .sort((left, right) => right.score - left.score);
};
