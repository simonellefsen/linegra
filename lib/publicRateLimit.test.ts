import { describe, expect, it } from 'vitest';
import { checkPublicRateLimit } from './publicRateLimit';

describe('publicRateLimit', () => {
  it('allows bursts then blocks when exhausted', () => {
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkPublicRateLimit(key, { capacity: 5, refillPerSecond: 0.001 }).allowed).toBe(true);
    }
    const blocked = checkPublicRateLimit(key, { capacity: 5, refillPerSecond: 0.001 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
