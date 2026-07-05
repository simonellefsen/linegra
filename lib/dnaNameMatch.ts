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

const sharesExactToken = (left: string[], right: string[]): boolean => {
  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
};

/** Raw ranking score (typically 0–1000). Higher is a stronger match. */
export const scoreNameMatch = (inputName: string, candidateName: string): number => {
  const normalizedInput = normalizeName(inputName);
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedInput || !normalizedCandidate) return 0;
  if (normalizedInput === normalizedCandidate) return 1000;

  const inputTokens = tokenizeName(normalizedInput);
  const candidateTokens = tokenizeName(normalizedCandidate);
  if (!inputTokens.length || !candidateTokens.length) return 0;

  if (inputTokens.length === 1 && candidateTokens.includes(inputTokens[0]!)) return 700;
  if (candidateTokens.length === 1 && inputTokens.includes(candidateTokens[0]!)) return 700;
  if (sharesExactToken(inputTokens, candidateTokens) && inputTokens.length > 1 && candidateTokens.length > 1) {
    const candidateSet = new Set(candidateTokens);
    const overlap = inputTokens.filter((token) => candidateSet.has(token)).length;
    if (overlap === inputTokens.length && overlap === candidateTokens.length) return 700;
  }

  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  inputTokens.forEach((token) => {
    if (candidateSet.has(token)) overlap += 1;
  });
  if (!overlap) return 0;
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
