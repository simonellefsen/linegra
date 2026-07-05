const readBypassSecret = (): string | undefined => {
  const env =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
  return env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || undefined;
};

/** Bypass header for protected Vercel previews (safe for fetch + Playwright request API). */
export const vercelProtectionBypassHeaders = (): Record<string, string> | undefined => {
  const secret = readBypassSecret();
  if (!secret) return undefined;
  return { 'x-vercel-protection-bypass': secret };
};
