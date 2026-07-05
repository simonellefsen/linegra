import { describe, expect, it } from 'vitest';
import { computeRelationship } from './relationshipCalculator';
import type { Relationship } from '../types';
import {
  FAMILY_KIT_MAX_MEOSES,
  formatExpectedCmRange,
  isWithinFamilyKitScope,
  resolveFamilyKitRelation,
  relationshipMeioses,
} from './dnaFamilyKits';

const link = (id: string, parentId: string, childId: string): Relationship => ({
  id,
  treeId: 'tree-1',
  type: 'bio_father',
  personId: parentId,
  relatedId: childId,
});

const buildGraph = (): Relationship[] => [
  link('gp_pa', 'gp', 'pa'),
  link('gmo_pa', 'gmo', 'pa'),
  link('gp_aunt', 'gp', 'aunt'),
  link('gmo_aunt', 'gmo', 'aunt'),
  link('pa_a', 'pa', 'a'),
  link('mo_a', 'mo', 'a'),
  link('pa_sib', 'pa', 'sib'),
  link('mo_sib', 'mo', 'sib'),
  link('aunt_cous', 'aunt', 'cous'),
  link('cous_gcous', 'cous', 'gcous'),
];

const rels = buildGraph();

describe('dnaFamilyKits', () => {
  it('includes grandparent within family-kit scope', () => {
    const view = resolveFamilyKitRelation('a', 'gp', rels);
    expect(view?.relationLabel).toBe('Grandparent');
    expect(view?.expectedCmRange).toBe('~1300–2300 cM');
    expect(view?.meioses).toBe(2);
  });

  it('includes sibling within family-kit scope', () => {
    const view = resolveFamilyKitRelation('a', 'sib', rels);
    expect(view?.relationLabel).toBe('Sibling');
    expect(view?.expectedCmRange).toBe('~2000–3400 cM');
  });

  it('includes first cousin within family-kit scope', () => {
    const view = resolveFamilyKitRelation('a', 'cous', rels);
    expect(view?.relationLabel).toBe('1st cousin');
    expect(view?.expectedCmRange).toBe('~850 cM typical');
  });

  it('includes first cousin once removed within family-kit scope', () => {
    const view = resolveFamilyKitRelation('a', 'gcous', rels);
    expect(view?.relationLabel).toBe('1st cousin once removed');
    expect(view?.expectedCmRange).toBe('~430 cM typical');
  });

  it('excludes unrelated people', () => {
    expect(resolveFamilyKitRelation('a', 'unrel', rels)).toBeNull();
  });

  it('respects the max-meioses ceiling', () => {
    const rel = computeRelationship('a', 'gcous', rels);
    expect(rel).not.toBeNull();
    expect(relationshipMeioses(rel!)).toBeLessThanOrEqual(FAMILY_KIT_MAX_MEOSES);
    expect(isWithinFamilyKitScope(rel)).toBe(true);
    expect(formatExpectedCmRange(rel!)).toContain('cM');
  });
});
