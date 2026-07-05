import { afterEach, describe, expect, it, vi } from 'vitest';
import { withVercelBypassQuery } from './e2eAppUrl';

describe('withVercelBypassQuery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('appends the bypass query param when configured', () => {
    vi.stubEnv('E2E_BASE_URL', 'https://preview.example.vercel.app');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'test-secret');
    expect(withVercelBypassQuery('/')).toBe('/?x-vercel-protection-bypass=test-secret');
    expect(withVercelBypassQuery('/tree/foo')).toBe('/tree/foo?x-vercel-protection-bypass=test-secret');
  });

  it('returns the path unchanged without a bypass secret', () => {
    expect(withVercelBypassQuery('/tree/foo')).toBe('/tree/foo');
  });
});
