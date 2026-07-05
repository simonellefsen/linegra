import { describe, expect, it } from 'vitest';
import {
  E2E_TOKEN_PREFIX,
  extractE2eAccessToken,
  isE2eAccessToken,
  supabaseAuthStorageKey,
} from './e2eToken';

describe('e2eToken', () => {
  it('recognizes lg_e2e_ prefix tokens', () => {
    const token = `${E2E_TOKEN_PREFIX}abc123`;
    expect(isE2eAccessToken(token)).toBe(true);
    expect(isE2eAccessToken('lg_other')).toBe(false);
  });

  it('extracts bearer and raw authorization tokens', () => {
    const token = `${E2E_TOKEN_PREFIX}deadbeef`;
    expect(extractE2eAccessToken(token)).toBe(token);
    expect(extractE2eAccessToken(`Bearer ${token}`)).toBe(token);
    expect(extractE2eAccessToken('Bearer not-a-token')).toBeNull();
  });

  it('builds the Supabase localStorage auth key from project URL', () => {
    expect(supabaseAuthStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
  });
});
