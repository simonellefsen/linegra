import { describe, expect, it } from 'vitest';
import { resolveSharedAutosomalParties } from './dnaSharedTestParties';

const HELLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERNILLE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BIRGITTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MARIANNE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const treePeople = [
  { id: HELLE, first_name: 'Helle', last_name: 'Andersen', maiden_name: 'Andersen' },
  { id: PERNILLE, first_name: 'Pernille', last_name: 'Gether Gamby', maiden_name: null },
  { id: BIRGITTA, first_name: 'Birgitta', last_name: 'Hallgren', maiden_name: 'Svensson' },
  { id: MARIANNE, first_name: 'Marianne', last_name: 'Gamby', maiden_name: null },
];

describe('resolveSharedAutosomalParties', () => {
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
    const helleView = resolveSharedAutosomalParties(BIRGITTA, helleTest, treePeople);
    const pernilleView = resolveSharedAutosomalParties(BIRGITTA, pernilleTest, treePeople);

    expect(helleView.kitOwner.personId).toBe(HELLE);
    expect(helleView.kitOwner.displayName).toBe('Helle Andersen');
    expect(pernilleView.kitOwner.personId).toBe(PERNILLE);
    expect(pernilleView.kitOwner.displayName).toBe('Pernille Gether Gamby');
    expect(helleView.match.personId).toBe(BIRGITTA);
    expect(pernilleView.match.personId).toBe(BIRGITTA);
  });

  it('honors an explicitly saved kit-owner UUID over CSV name heuristics', () => {
    const view = resolveSharedAutosomalParties(
      BIRGITTA,
      {
        sharedPersonId: MARIANNE,
        sharedMatchPersonId: BIRGITTA,
        sharedSegmentSummary: {
          // FTDNA comparison exports do not identify the tested person. A later
          // curator selection must not be replaced by the match-profile name.
          personName: 'Unknown',
          matchName: 'Birgitta Svensson Hallgren',
          fileName: '33413_Chromosome_Browser_Results.csv',
          importFormat: 'FTDNA_COMPARISON_SEGMENTS',
          segmentCount: 2,
          totalCentimorgans: 36,
          largestSegmentCentimorgans: 28.6,
          importedAt: '2026-07-05T00:00:00.000Z',
          source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV' as const,
          totalSnps: 0,
        },
      },
      treePeople
    );
    expect(view.kitOwner.personId).toBe(MARIANNE);
    expect(view.kitOwner.displayName).toBe('Marianne Gamby');
  });

  it('infers kit owner from CSV when only names are stored', () => {
    const view = resolveSharedAutosomalParties(
      BIRGITTA,
      {
        sharedSegmentSummary: helleTest.sharedSegmentSummary,
      },
      treePeople
    );
    expect(view.kitOwner.displayName).toBe('Helle Andersen');
    expect(view.kitOwner.personId).toBe(HELLE);
    expect(view.match.displayName).toBe('Birgitta Hallgren');
    expect(view.match.personId).toBe(BIRGITTA);
  });
});
