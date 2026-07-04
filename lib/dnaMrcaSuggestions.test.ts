import { describe, expect, it } from 'vitest';
import { suggestMrcaCandidates, type MatchLineageInput } from './dnaMrcaSuggestions';
import { Relationship } from '../types';

const link = (id: string, parentId: string, childId: string): Relationship => ({
  id,
  treeId: 'tree-1',
  type: 'bio_father',
  personId: parentId,
  relatedId: childId,
});

const rels: Relationship[] = [
  link('gp_pa', 'gp', 'pa'),
  link('gmo_pa', 'gmo', 'pa'),
  link('gp_aunt', 'gp', 'aunt'),
  link('gmo_aunt', 'gmo', 'aunt'),
  link('pa_a', 'pa', 'a'),
  link('mo_a', 'mo', 'a'),
  link('aunt_cous', 'aunt', 'cous'),
  link('cous_cous2', 'cous', 'cous2'),
];

const names: Record<string, string> = {
  gp: 'Grandpa',
  gmo: 'Grandma',
  pa: 'Father',
  mo: 'Mother',
  aunt: 'Aunt',
  a: 'Tester',
  cous: 'Cousin A',
  cous2: 'Cousin B',
};

const matchInput = (
  matchId: string,
  counterpartId: string,
  sharedCM: number,
  pathPersonIds: string[]
): MatchLineageInput => ({
  matchId,
  counterpartPersonId: counterpartId,
  counterpartPersonName: names[counterpartId] || counterpartId,
  sharedCM,
  segments: 4,
  pathPersonIds,
  pathRelationshipIds: pathPersonIds.slice(0, -1).map((_, i) => `rel-${i}`),
  pathFound: pathPersonIds.length > 1,
  pathFitsPrediction: true,
});

describe('suggestMrcaCandidates', () => {
  it('ranks a shared grandparent higher when two cousins support it', () => {
    const candidates = suggestMrcaCandidates(
      'a',
      [
        matchInput('m1', 'cous', 90, ['a', 'pa', 'gp', 'aunt', 'cous']),
        matchInput('m2', 'cous2', 85, ['a', 'pa', 'gp', 'aunt', 'cous', 'cous2']),
      ],
      rels,
      (id) => names[id] || id,
      { clusterGroups: [['m1', 'm2']] }
    );

    expect(candidates.length).toBeGreaterThan(0);
    const gp = candidates.find((row) => row.ancestorPersonId === 'gp');
    expect(gp).toBeDefined();
    expect(gp?.supportingMatchIds).toEqual(expect.arrayContaining(['m1', 'm2']));
    expect(gp?.primaryRelationshipLabel).toContain('cousin');
    expect(candidates[0].supportingMatchIds.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty when matches are unrelated to the tree', () => {
    const candidates = suggestMrcaCandidates(
      'a',
      [
        {
          matchId: 'x',
          counterpartPersonId: 'stranger',
          counterpartPersonName: 'Stranger',
          sharedCM: 40,
          segments: 2,
          pathPersonIds: [],
          pathRelationshipIds: [],
          pathFound: false,
          pathFitsPrediction: false,
        },
      ],
      rels,
      (id) => names[id] || id
    );
    expect(candidates).toEqual([]);
  });

  it('filters by minimum supporting matches', () => {
    const candidates = suggestMrcaCandidates(
      'a',
      [matchInput('m1', 'cous', 90, ['a', 'pa', 'gp', 'aunt', 'cous'])],
      rels,
      (id) => names[id] || id,
      { minSupportingMatches: 2 }
    );
    expect(candidates).toEqual([]);
  });
});
