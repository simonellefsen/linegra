const ensureStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const K3_DISMISSED_FOR_KEY = 'k3_dismissed_for';

export const isK3DismissedForFocus = (
  metadata: Record<string, unknown>,
  focusPersonId: string
): boolean => ensureStringArray(metadata[K3_DISMISSED_FOR_KEY]).includes(focusPersonId);

export const withK3DismissedForFocus = (
  metadata: Record<string, unknown>,
  focusPersonId: string
): Record<string, unknown> => {
  const current = ensureStringArray(metadata[K3_DISMISSED_FOR_KEY]);
  if (current.includes(focusPersonId)) return metadata;
  return { ...metadata, [K3_DISMISSED_FOR_KEY]: [...current, focusPersonId] };
};
