import { describe, expect, it } from 'vitest';
import { labelClientErrorKind, mapClientErrorStats } from './clientErrorStats';

describe('clientErrorStats', () => {
  it('maps RPC payload into typed stats', () => {
    const stats = mapClientErrorStats({
      days: 7,
      totals: { hits: 4, unique_signatures: 2 },
      byDay: [{ day: '2026-07-05', hits: 4 }],
      byRoute: [{ route: '/tree/demo', hits: 3 }],
      byKind: [{ kind: 'boundary', hits: 2 }],
      topErrors: [
        {
          message: 'Cannot read properties of undefined',
          stack_hash: 'abc12345',
          hits: 2,
          last_seen: '2026-07-05T10:00:00Z',
        },
      ],
      recent: [
        {
          recorded_at: '2026-07-05T10:00:00Z',
          kind: 'boundary',
          message: 'Cannot read properties of undefined',
          stack_hash: 'abc12345',
          route: '/tree/demo',
          source: 'Pedigree panel',
        },
      ],
    });
    expect(stats.totals.hits).toBe(4);
    expect(stats.byRoute[0]?.route).toBe('/tree/demo');
    expect(stats.topErrors[0]?.stackHash).toBe('abc12345');
    expect(stats.recent[0]?.source).toBe('Pedigree panel');
  });

  it('labels error kinds for display', () => {
    expect(labelClientErrorKind('rejection')).toBe('Unhandled promise');
    expect(labelClientErrorKind('boundary')).toBe('React boundary');
    expect(labelClientErrorKind('error')).toBe('Runtime error');
  });
});
