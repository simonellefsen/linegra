export const E2E_TOKEN_PREFIX = 'lg_e2e_';

export const isE2eAccessToken = (value: string | null | undefined): boolean =>
  Boolean(value?.startsWith(E2E_TOKEN_PREFIX));

export const extractE2eAccessToken = (authorization: string | null): string | null => {
  if (!authorization) return null;
  const trimmed = authorization.trim();
  if (isE2eAccessToken(trimmed)) return trimmed;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  const candidate = bearerMatch?.[1]?.trim() ?? '';
  return isE2eAccessToken(candidate) ? candidate : null;
};

export const supabaseAuthStorageKey = (supabaseUrl: string): string => {
  const hostname = new URL(supabaseUrl).hostname;
  const projectRef = hostname.split('.')[0] ?? 'unknown';
  return `sb-${projectRef}-auth-token`;
};
