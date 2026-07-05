import { describe, expect, it } from 'vitest';
import { markClientErrorRecorded, shouldRecordClientError } from './clientErrorTelemetry';

describe('clientErrorTelemetry rate limit', () => {
  it('allows up to three reports per stack hash per hour', () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    let store = {};
    expect(shouldRecordClientError('abc', now, store)).toBe(true);
    store = markClientErrorRecorded('abc', now, store);
    expect(shouldRecordClientError('abc', now + 1000, store)).toBe(true);
    store = markClientErrorRecorded('abc', now + 1000, store);
    store = markClientErrorRecorded('abc', now + 2000, store);
    expect(shouldRecordClientError('abc', now + 3000, store)).toBe(false);
  });

  it('resets the window after an hour', () => {
    const start = Date.UTC(2026, 6, 5, 12, 0, 0);
    let store = markClientErrorRecorded('abc', start, {});
    store = markClientErrorRecorded('abc', start + 1000, store);
    store = markClientErrorRecorded('abc', start + 2000, store);
    expect(shouldRecordClientError('abc', start + 3_700_000, store)).toBe(true);
  });
});
