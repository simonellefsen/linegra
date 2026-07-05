/** Headers to bypass Vercel Deployment Protection on preview URLs (CI / Playwright). */
export const vercelProtectionBypassHeaders = (): Record<string, string> | undefined => {
  const env =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return undefined;
  return {
    'x-vercel-protection-bypass': secret,
    'x-vercel-set-bypass-cookie': 'true',
  };
};
