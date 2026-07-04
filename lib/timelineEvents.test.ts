import { describe, expect, it } from 'vitest';
import { collectTimelineEntries, timelineYearRange } from './timelineEvents';
import type { Person } from '../types';

const person = (id: string, firstName: string, extra: Partial<Person> = {}): Person => ({
  id,
  treeId: 't1',
  firstName,
  lastName: 'Test',
  gender: 'O',
  updatedAt: '2026-07-04T00:00:00Z',
  ...extra,
});

describe('collectTimelineEntries', () => {
  it('sorts dated vitals and events chronologically', () => {
    const entries = collectTimelineEntries([
      person('a', 'Ada', { birthDate: '1880', deathDate: '1950' }),
      person('b', 'Bob', { birthDate: '1850' }),
    ]);
    expect(entries[0]?.year).toBe(1850);
    expect(entries[entries.length - 1]?.year).toBe(1950);
  });

  it('computes year range', () => {
    const entries = collectTimelineEntries([
      person('a', 'Ada', { birthDate: '1880' }),
      person('b', 'Bob', { deathDate: '1920' }),
    ]);
    expect(timelineYearRange(entries)).toEqual({ min: 1880, max: 1920 });
  });
});
