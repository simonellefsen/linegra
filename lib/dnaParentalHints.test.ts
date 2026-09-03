import { describe, it, expect } from 'vitest';
import type { Person, Relationship } from '../types';
import {
  getBioParents,
  inferPathGrandparentSlot,
  inferPathParentalSide,
  resolveGrandparentSlots,
  splitClustersByParentalSide,
} from './dnaParentalHints';

const person = (id: string, firstName: string, lastName: string): Person => ({
  id,
  treeId: 'tree-1',
  firstName,
  lastName,
  gender: 'O',
  updatedAt: '2026-01-01',
});

const parentRel = (id: string, parentId: string, childId: string, type: Relationship['type']): Relationship => ({
  id,
  personId: parentId,
  relatedId: childId,
  type,
  treeId: 'tree-1',
});

describe('getBioParents', () => {
  it('returns mother and father ids from bio links', () => {
    const rels = [
      parentRel('r1', 'mom', 'child', 'bio_mother'),
      parentRel('r2', 'dad', 'child', 'bio_father'),
    ];
    expect(getBioParents('child', rels)).toEqual({ motherId: 'mom', fatherId: 'dad' });
  });
});

describe('inferPathParentalSide', () => {
  const rels = [parentRel('r1', 'mom', 't', 'bio_mother'), parentRel('r2', 'dad', 't', 'bio_father')];

  it('returns maternal when path includes only the mother', () => {
    expect(inferPathParentalSide(['t', 'mom', 'gma'], 't', rels)).toBe('maternal');
  });

  it('returns paternal when path includes only the father', () => {
    expect(inferPathParentalSide(['t', 'dad', 'gpa'], 't', rels)).toBe('paternal');
  });

  it('returns unknown when both parents appear', () => {
    expect(inferPathParentalSide(['t', 'mom', 'dad'], 't', rels)).toBe('unknown');
  });
});

describe('resolveGrandparentSlots and inferPathGrandparentSlot', () => {
  const people = new Map<string, Person>([
    ['t', person('t', 'Tester', 'User')],
    ['mom', person('mom', 'Anna', 'M')],
    ['dad', person('dad', 'Bob', 'F')],
    ['mgf', person('mgf', 'Ole', 'MG')],
    ['mgm', person('mgm', 'Inga', 'MM')],
  ]);
  const rels = [
    parentRel('r1', 'mom', 't', 'bio_mother'),
    parentRel('r2', 'dad', 't', 'bio_father'),
    parentRel('r3', 'mgf', 'mom', 'bio_father'),
    parentRel('r4', 'mgm', 'mom', 'bio_mother'),
  ];

  it('resolves maternal grandparents', () => {
    const slots = resolveGrandparentSlots('t', rels, people);
    expect(slots.map((s) => s.key)).toEqual(['mgf', 'mgm']);
  });

  it('assigns a match path to the grandparent on the path', () => {
    const slots = resolveGrandparentSlots('t', rels, people);
    const slot = inferPathGrandparentSlot(['t', 'mom', 'mgf', 'cousin'], slots);
    expect(slot?.key).toBe('mgf');
    expect(slot?.label).toBe('Ole MG');
  });
});

describe('splitClustersByParentalSide', () => {
  it('splits a cluster that mixes maternal and paternal documented paths', () => {
    const side = new Map([
      ['a', 'maternal' as const],
      ['b', 'maternal' as const],
      ['c', 'paternal' as const],
      ['d', 'paternal' as const],
    ]);
    const split = splitClustersByParentalSide([['a', 'b', 'c', 'd']], side);
    expect(split).toContainEqual(['a', 'b']);
    expect(split).toContainEqual(['c', 'd']);
  });

  it('keeps a cluster when all matches share one parental side', () => {
    const side = new Map([
      ['a', 'maternal' as const],
      ['b', 'maternal' as const],
    ]);
    expect(splitClustersByParentalSide([['a', 'b']], side)).toEqual([['a', 'b']]);
  });

  it('assigns unknown-side matches to the larger parental subgroup', () => {
    const side = new Map([
      ['a', 'maternal' as const],
      ['b', 'maternal' as const],
      ['c', 'paternal' as const],
      ['u', 'unknown' as const],
    ]);
    const split = splitClustersByParentalSide([['a', 'b', 'c', 'u']], side);
    expect(split).toEqual([['a', 'b', 'u']]);
  });
});
