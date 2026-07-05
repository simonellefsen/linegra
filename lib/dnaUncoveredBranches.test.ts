import { describe, expect, it } from 'vitest';
import type { Relationship } from '../types';
import {
  collectCoverageGapPersonIds,
  cousinGenerationBand,
  coupleUnionKey,
  enumerateAncestorCouples,
  suggestUncoveredBranchCandidates,
} from './dnaUncoveredBranches';

const TREE = 'tree-1';
const FOCUS = 'focus';
const FATHER = 'father';
const MOTHER = 'mother';
const PGF = 'pgf';
const PGM = 'pgm';
const PGGF = 'pggf';
const PGGM = 'pgggm';
const PGFATHER = 'pgfather';
const PGMOTHER = 'pgmother';
const MGF = 'mgf';
const MGM = 'mgm';

const rel = (
  id: string,
  personId: string,
  relatedId: string,
  type: Relationship['type']
): Relationship => ({
  id,
  treeId: TREE,
  personId,
  relatedId,
  type,
  status: 'current',
});

const names: Record<string, string> = {
  [FOCUS]: 'Tester',
  [FATHER]: 'Father Test',
  [MOTHER]: 'Mother Test',
  [PGF]: 'Paternal GF',
  [PGM]: 'Paternal GM',
  [PGGF]: 'Paternal GGF',
  [PGGM]: 'Paternal GGM',
  [PGFATHER]: 'Frederik Sophus Valdemar Andersen',
  [PGMOTHER]: 'Olga Augusta Andersen',
  [MGF]: 'Maternal GF',
  [MGM]: 'Maternal GM',
};

const baseRelationships: Relationship[] = [
  rel('r1', FATHER, FOCUS, 'bio_father'),
  rel('r2', MOTHER, FOCUS, 'bio_mother'),
  rel('r3', PGF, FATHER, 'bio_father'),
  rel('r4', PGM, FATHER, 'bio_mother'),
  rel('r5', MGF, MOTHER, 'bio_father'),
  rel('r6', MGM, MOTHER, 'bio_mother'),
  rel('r7', PGGF, PGF, 'bio_father'),
  rel('r8', PGGM, PGF, 'bio_mother'),
  rel('r9', PGFATHER, PGGF, 'bio_father'),
  rel('r10', PGMOTHER, PGGF, 'bio_mother'),
];

describe('dnaUncoveredBranches', () => {
  it('maps cM to a cousin generation band', () => {
    expect(cousinGenerationBand(118.8).bandLabel).toBe('3rd cousin cluster');
    expect(cousinGenerationBand(118.8).minGen).toBe(4);
  });

  it('enumerates parent pairs by generation', () => {
    const couples = enumerateAncestorCouples(FOCUS, baseRelationships, (id) => names[id] || id);
    expect(couples.some((c) => c.key === coupleUnionKey(PGFATHER, PGMOTHER) && c.generation === 4)).toBe(
      true
    );
  });

  it('ranks an uncovered grandparent couple for a 3C-band unclustered match', () => {
    const ranked = suggestUncoveredBranchCandidates({
      focusPersonId: FOCUS,
      sharedCM: 118.8,
      segments: 6,
      relationships: baseRelationships,
      resolveName: (id) => names[id] || id,
      matchClusterIndices: [],
      mrcaCandidates: [
        { ancestorPersonId: MGF, clusterIndices: [0] },
      ],
    });
    const top = ranked[0];
    expect(top?.couple.key).toBe(coupleUnionKey(PGFATHER, PGMOTHER));
    expect(top?.coverageTier).toBe('none');
    expect(top?.rationale).toContain('Frederik Sophus Valdemar Andersen');
    expect(top?.researchTodo).toContain('trace descendants');
  });

  it('collects person ids on couples with coverage gaps', () => {
    const gaps = collectCoverageGapPersonIds(FOCUS, baseRelationships, (id) => names[id] || id);
    expect(gaps.has(PGFATHER)).toBe(true);
    expect(gaps.has(PGMOTHER)).toBe(true);
  });
});
