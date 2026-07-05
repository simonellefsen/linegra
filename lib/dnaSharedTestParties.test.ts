import { describe, expect, it } from 'vitest';
import { resolveSharedAutosomalParties } from './dnaSharedTestParties';

const HELLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERNILLE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BIRGITTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('resolveSharedAutosomalParties', () => {
  const names = new Map([
    [HELLE, 'Helle Andersen'],
    [PERNILLE, 'Pernille Gether Gamby'],
    [BIRGITTA, 'Birgitta Hallgren'],
  ]);

  const nameForId = (id: string) => names.get(id) ?? null;
  const resolveNameToPersonId = (name: string) => {
    for (const [id, display] of names) {
      if (display.toLowerCase().includes(name.split(' ')[0]!.toLowerCase())) return id;
    }
    return null;
  };

  const helleTest = {
    sharedPersonId: HELLE,
    sharedMatchPersonId: BIRGITTA,
    sharedMatchName: 'Birgitta Svensson Hallgren',
    sharedSegmentSummary: {
      personName: 'Helle Due',
      matchName: 'Birgitta Svensson Hallgren',
      fileName: 'Shared DNA segments of Helle Due and Birgitta Svensson Hallgren.csv',
      segmentCount: 2,
      totalCentimorgans: 38.2,
      largestSegmentCentimorgans: 25.9,
      importedAt: '2026-07-05T00:00:00.000Z',
      source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV' as const,
      totalSnps: 0,
    },
  };

  const pernilleTest = {
    sharedPersonId: PERNILLE,
    sharedMatchPersonId: BIRGITTA,
    sharedMatchName: 'Birgitta Svensson Hallgren',
    sharedSegmentSummary: {
      personName: 'Pernille Gether Gamby',
      matchName: 'Birgitta Svensson Hallgren',
      fileName: 'Shared DNA segments of Pernille Gether Gamby and Birgitta Svensson Hallgren.csv',
      segmentCount: 3,
      totalCentimorgans: 41.5,
      largestSegmentCentimorgans: 18.2,
      importedAt: '2026-07-05T00:00:00.000Z',
      source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV' as const,
      totalSnps: 0,
    },
  };

  it('resolves distinct kit owners for multiple tests on the match profile', () => {
    const helleView = resolveSharedAutosomalParties(BIRGITTA, helleTest, nameForId, resolveNameToPersonId);
    const pernilleView = resolveSharedAutosomalParties(
      BIRGITTA,
      pernilleTest,
      nameForId,
      resolveNameToPersonId
    );

    expect(helleView.kitOwner.personId).toBe(HELLE);
    expect(helleView.kitOwner.displayName).toBe('Helle Andersen');
    expect(pernilleView.kitOwner.personId).toBe(PERNILLE);
    expect(pernilleView.kitOwner.displayName).toBe('Pernille Gether Gamby');
    expect(helleView.match.personId).toBe(BIRGITTA);
    expect(pernilleView.match.personId).toBe(BIRGITTA);
  });

  it('infers kit owner from CSV when only names are stored', () => {
    const view = resolveSharedAutosomalParties(
      BIRGITTA,
      {
        sharedSegmentSummary: helleTest.sharedSegmentSummary,
      },
      nameForId,
      resolveNameToPersonId
    );
    expect(view.kitOwner.displayName).toBe('Helle Andersen');
    expect(view.kitOwner.personId).toBe(HELLE);
    expect(view.match.displayName).toBe('Birgitta Hallgren');
    expect(view.match.personId).toBe(BIRGITTA);
  });
});
