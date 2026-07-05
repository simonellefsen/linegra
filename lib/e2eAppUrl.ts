/** Relative app path with Vercel protection bypass query (browser navigations). */
export const withVercelBypassQuery = (path: string): string => {
  const env =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return path;

  const base = env.E2E_BASE_URL ?? 'http://127.0.0.1';
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('x-vercel-protection-bypass', secret);
  return `${url.pathname}${url.search}${url.hash}`;
};
