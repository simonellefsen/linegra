/** K8a/K8b — fuzzy name matching for DNA placement (ranking scores, not percentages). */

const normalizeName = (value?: string | null): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const tokenizeName = (value?: string | null): string[] =>
  normalizeName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

/** Raw ranking score (typically 0–1000). Higher is a stronger match. */
export const scoreNameMatch = (inputName: string, candidateName: string): number => {
  const normalizedInput = normalizeName(inputName);
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedInput || !normalizedCandidate) return 0;
  if (normalizedInput === normalizedCandidate) return 1000;

  const inputTokens = tokenizeName(normalizedInput);
  const candidateTokens = tokenizeName(normalizedCandidate);
  if (!inputTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  const sharedTokens = inputTokens.filter((token) => candidateSet.has(token));
  const overlap = sharedTokens.length;

  // A common given name or surname alone is not enough to offer an action that
  // links an imported DNA match to a person. Permit omitted middle names, but
  // require a matching surname and at least one other name token.
  const sharesSurname = inputTokens.at(-1) === candidateTokens.at(-1);
  if (inputTokens.length < 2 || candidateTokens.length < 2 || !sharesSurname || overlap < 2) return 0;

  let score = overlap * 40;
  if (candidateTokens[0] === inputTokens[0]) score += 15;
  if (candidateTokens[candidateTokens.length - 1] === inputTokens[inputTokens.length - 1]) score += 30;
  if (candidateTokens.length === inputTokens.length) score += 10;
  return score;
};

/** Map ranking scores to a 0–100 scale for display and threshold checks. */
export const normalizeNameMatchScore = (rawScore: number): number => {
  if (rawScore >= 1000) return 100;
  if (rawScore >= 700) return 70;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
};

export const nameMatchConfidenceLabel = (rawScore: number): 'High' | 'Medium' | 'Low' => {
  const normalized = normalizeNameMatchScore(rawScore);
  if (normalized >= 80) return 'High';
  if (normalized >= 60) return 'Medium';
  return 'Low';
};

export const formatNameMatchRationale = (rawScore: number): string => {
  const label = nameMatchConfidenceLabel(rawScore);
  const normalized = normalizeNameMatchScore(rawScore);
  return `Name match (${label}, ${normalized}/100)`;
};
