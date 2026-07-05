/** Stable short hash for grouping client error stacks (no full stack persisted). */
export const hashClientErrorStack = (stack?: string | null): string => {
  const input = (stack ?? '').slice(0, 2000);
  if (!input) return 'no-stack';
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
