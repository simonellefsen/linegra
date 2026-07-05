import { describe, expect, it } from 'vitest';
import { parseMatchDisplayName, suggestUnknownMatchPlacements } from './dnaMatchPlacement';
import type { ClusterSegment } from './dnaClustering';

const seg = (chromosome: string, start: number, end: number, centimorgans = 12): ClusterSegment => ({
  chromosome,
  start,
  end,
  centimorgans,
});

describe('parseMatchDisplayName', () => {
  it('splits first and last name', () => {
    expect(parseMatchDisplayName('Erik Leth Simonsen')).toEqual({
      firstName: 'Erik Leth',
      lastName: 'Simonsen',
    });
  });

  it('handles single-token names', () => {
    expect(parseMatchDisplayName('Mystery')).toEqual({ firstName: 'Mystery', lastName: 'DNA Match' });
  });
});

describe('suggestUnknownMatchPlacements', () => {
  it('prioritizes a strong name match', () => {
    const suggestions = suggestUnknownMatchPlacements(
      {
        matchId: 'unknown-1',
        matchName: 'Simon Kristian Kildal Rasmussen',
        sharedCM: 66,
        segments: 3,
        predictionLabel: '4th cousin cluster',
        segmentsPreview: [],
      },
      {
        mrcaCandidates: [],
        linkedMatches: [],
        clusterGroups: [],
        nameMatchCandidate: {
          personId: 'simon-id',
          personName: 'Simon Kristian Kildal Rasmussen',
          score: 1000,
        },
      }
    );
    expect(suggestions[0].kind).toBe('link_existing');
    expect(suggestions[0].anchorPersonId).toBe('simon-id');
  });

  it('suggests cluster-line placement when segments overlap linked matches', () => {
    const suggestions = suggestUnknownMatchPlacements(
      {
        matchId: 'unknown-1',
        matchName: 'Unknown Cousin',
        sharedCM: 45,
        segments: 2,
        predictionLabel: '4th cousin cluster',
        segmentsPreview: [seg('3', 1000, 5000, 20)],
      },
      {
        mrcaCandidates: [
          {
            ancestorPersonId: 'gp',
            ancestorName: 'Grandpa',
            supportingMatchIds: ['m1'],
            supportingMatchNames: ['Cousin A'],
            totalSharedCm: 90,
            clusterIndices: [0],
            relationshipLabels: ['1st cousin'],
            primaryRelationshipLabel: '1st cousin',
            cmCompatibleCount: 1,
            pathConvergenceCount: 0,
            score: 200,
          },
        ],
        linkedMatches: [
          { matchId: 'm1', counterpartName: 'Cousin A', segments: [seg('3', 1200, 5200, 18)] },
        ],
        clusterGroups: [['m1', 'unknown-1']],
        minClusterCm: 7,
      }
    );
    expect(suggestions.some((item) => item.kind === 'cluster_line')).toBe(true);
  });

  it('suggests uncovered_branch when focus tree and cM band have a gap couple', () => {
    const FOCUS = 'focus';
    const FATHER = 'father';
    const MOTHER = 'mother';
    const PGF = 'pgf';
    const PGM = 'pgm';
    const PGGF = 'pggf';
    const PGGM = 'pgggm';
    const PGFATHER = 'pgfather';
    const PGMOTHER = 'pgmother';
    const TREE = 'tree-1';
    const rel = (
      id: string,
      personId: string,
      relatedId: string,
      type: import('../types').Relationship['type']
    ): import('../types').Relationship => ({
      id,
      treeId: TREE,
      personId,
      relatedId,
      type,
      status: 'current',
    });
    const relationships = [
      rel('r1', FATHER, FOCUS, 'bio_father'),
      rel('r2', MOTHER, FOCUS, 'bio_mother'),
      rel('r3', PGF, FATHER, 'bio_father'),
      rel('r4', PGM, FATHER, 'bio_mother'),
      rel('r5', PGGF, PGF, 'bio_father'),
      rel('r6', PGGM, PGF, 'bio_mother'),
      rel('r7', PGFATHER, PGGF, 'bio_father'),
      rel('r8', PGMOTHER, PGGF, 'bio_mother'),
    ];
    const names: Record<string, string> = {
      [PGFATHER]: 'Frederik',
      [PGMOTHER]: 'Olga',
    };
    const suggestions = suggestUnknownMatchPlacements(
      {
        matchId: 'unknown-tia',
        matchName: 'Tia Edelman',
        sharedCM: 118.8,
        segments: 6,
        predictionLabel: '3rd cousin cluster',
        segmentsPreview: [],
      },
      {
        mrcaCandidates: [],
        linkedMatches: [],
        clusterGroups: [],
        focusPersonId: FOCUS,
        relationships,
        resolvePersonName: (id) => names[id] || id,
      }
    );
    expect(suggestions.some((item) => item.kind === 'uncovered_branch')).toBe(true);
  });
});
