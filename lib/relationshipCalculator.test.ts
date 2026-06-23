import { describe, it, expect } from 'vitest';
import { computeRelationship } from './relationshipCalculator';
import { Person, Relationship } from '../types';

const person = (id: string, firstName = ''): Person => ({
  id,
  treeId: 'tree-1',
  firstName,
  lastName: '',
  gender: 'O',
  updatedAt: '2026-06-23T00:00:00Z',
});

// parent → child parental link.
const link = (id: string, parentId: string, childId: string): Relationship => ({
  id,
  treeId: 'tree-1',
  type: 'bio_father',
  personId: parentId,
  relatedId: childId,
});

// Graph:
//   gp ── (spouse) ── gmo
//    ├── pa ── (spouse) ── mo ──┬── a (self)
//    │                          ├── sib
//    │                          └── (half shares only pa)
//    └── aunt ── cous ── gcous
const buildGraph = (): { people: Person[]; rels: Relationship[] } => {
  const people = ['gp', 'gmo', 'pa', 'mo', 'otherMo', 'a', 'sib', 'half', 'aunt', 'cous', 'gcous', 'niece', 'unrel'].map(
    (id) => person(id)
  );
  const rels: Relationship[] = [
    link('gp_pa', 'gp', 'pa'),
    link('gmo_pa', 'gmo', 'pa'),
    link('gp_aunt', 'gp', 'aunt'),
    link('gmo_aunt', 'gmo', 'aunt'),
    link('pa_a', 'pa', 'a'),
    link('mo_a', 'mo', 'a'),
    link('pa_sib', 'pa', 'sib'),
    link('mo_sib', 'mo', 'sib'),
    link('pa_half', 'pa', 'half'),
    link('otherMo_half', 'otherMo', 'half'),
    link('aunt_cous', 'aunt', 'cous'),
    link('cous_gcous', 'cous', 'gcous'),
    link('sib_niece', 'sib', 'niece'),
  ];
  return { people, rels };
};

const rel = (a: string, b: string) => {
  const { rels } = buildGraph();
  return computeRelationship(a, b, rels);
};

describe('computeRelationship — direct line', () => {
  it('self', () => {
    expect(rel('a', 'a')?.kind).toBe('self');
  });
  it('parent / child (directional)', () => {
    expect(rel('a', 'pa')?.label).toBe('parent'); // B=pa is A's parent
    expect(rel('pa', 'a')?.label).toBe('child'); // B=a is pa's child
  });
  it('grandparent / grandchild', () => {
    expect(rel('a', 'gp')?.label).toBe('grandparent');
    expect(rel('gp', 'a')?.label).toBe('grandchild');
  });
  it('great-grandparent depth label', () => {
    expect(rel('gcous', 'gp')?.label).toBe('great-grandparent'); // gcous → cous → aunt → gp
  });
});

describe('computeRelationship — collateral', () => {
  it('full sibling (two shared parents)', () => {
    const r = rel('a', 'sib');
    expect(r?.label).toBe('sibling');
    expect(r?.commonAncestorIds).toHaveLength(2);
  });
  it('half-sibling (one shared parent)', () => {
    const r = rel('a', 'half');
    expect(r?.label).toBe('half-sibling');
    expect(r?.commonAncestorIds).toHaveLength(1);
  });
  it('aunt / uncle', () => {
    expect(rel('a', 'aunt')?.label).toBe('aunt/uncle');
  });
  it('niece / nephew', () => {
    expect(rel('a', 'niece')?.label).toBe('niece/nephew');
  });
});

describe('computeRelationship — cousins', () => {
  it('first cousin', () => {
    const r = rel('a', 'cous');
    expect(r?.label).toBe('1st cousin');
    expect(r?.cousinDegree).toBe(1);
    expect(r?.removed).toBe(0);
  });
  it('first cousin once removed', () => {
    const r = rel('a', 'gcous');
    expect(r?.label).toBe('1st cousin once removed');
    expect(r?.cousinDegree).toBe(1);
    expect(r?.removed).toBe(1);
  });
});

describe('computeRelationship — path + unrelated', () => {
  it('reconstructs the A → MRCA → B path', () => {
    const r = rel('a', 'cous');
    expect(r?.pathPersonIds[0]).toBe('a');
    expect(r?.pathPersonIds[r.pathPersonIds.length - 1]).toBe('cous');
    // MRCA (gp) is somewhere in the middle.
    expect(r?.pathPersonIds).toContain('gp');
  });
  it('returns null when no blood relationship exists', () => {
    expect(rel('a', 'unrel')).toBeNull();
  });
});
