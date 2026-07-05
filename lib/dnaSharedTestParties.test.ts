import { describe, expect, it } from 'vitest';
import { resolveSharedAutosomalParties } from './dnaSharedTestParties';

const HELLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MONA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('resolveSharedAutosomalParties', () => {
  const names = new Map([
    [HELLE, 'Helle Andersen'],
    [MONA, 'Mona Howell'],
  ]);

  const nameForId = (id: string) => names.get(id) ?? null;

  const baseTest = {
    sharedPersonId: HELLE,
    sharedMatchPersonId: MONA,
    sharedMatchName: 'Mona Howell',
    sharedSegmentSummary: {
      personName: 'Helle Andersen',
      matchName: 'Mona Howell',
      fileName: 'Shared DNA segments of Helle Andersen and Mona Howell.csv',
      segmentCount: 5,
      totalCentimorgans: 53.2,
      largestSegmentCentimorgans: 13.1,
      importedAt: '2026-07-05T00:00:00.000Z',
      source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV' as const,
      totalSnps: 0,
    },
  };

  it('shows kit owner and match names from linked person ids', () => {
    const view = resolveSharedAutosomalParties(baseTest, nameForId);
    expect(view.kitOwner.displayName).toBe('Helle Andersen');
    expect(view.kitOwner.personId).toBe(HELLE);
    expect(view.match.displayName).toBe('Mona Howell');
    expect(view.match.personId).toBe(MONA);
  });

  it('falls back to CSV names when person ids are missing', () => {
    const view = resolveSharedAutosomalParties({
      sharedSegmentSummary: baseTest.sharedSegmentSummary,
    });
    expect(view.kitOwner.displayName).toBe('Helle Andersen');
    expect(view.match.displayName).toBe('Mona Howell');
  });
});
