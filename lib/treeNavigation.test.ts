import { describe, expect, it } from 'vitest';
import {
  buildAncestorBreadcrumbs,
  findChildIds,
  findParentIds,
  findSiblingIds,
  resolveTreeNavTarget,
} from './treeNavigation';
import type { Person, Relationship } from '../types';

const person = (id: string, firstName: string): Person => ({
  id,
  treeId: 't1',
  firstName,
  lastName: 'X',
  gender: 'O',
  updatedAt: '2026-07-04T00:00:00Z',
});

const link = (id: string, parentId: string, childId: string, type: Relationship['type'] = 'bio_father'): Relationship => ({
  id,
  treeId: 't1',
  type,
  personId: parentId,
  relatedId: childId,
});

describe('treeNavigation', () => {
  const people = [person('c', 'Child'), person('f', 'Father'), person('m', 'Mother'), person('s', 'Sibling')];
  const rels: Relationship[] = [
    link('r1', 'f', 'c', 'bio_father'),
    link('r2', 'm', 'c', 'bio_mother'),
    link('r3', 'f', 's', 'bio_father'),
    link('r4', 'm', 's', 'bio_mother'),
  ];
  const byId = new Map(people.map((p) => [p.id, p]));

  it('builds ancestor breadcrumbs from focus to root', () => {
    const crumbs = buildAncestorBreadcrumbs('c', people, rels);
    expect(crumbs.map((c) => c.personId)).toEqual(['f', 'c']);
  });

  it('finds parents, children, and siblings', () => {
    expect(findParentIds('c', rels).sort()).toEqual(['f', 'm']);
    expect(findChildIds('f', rels).sort()).toEqual(['c', 's']);
    expect(findSiblingIds('c', rels)).toEqual(['s']);
  });

  it('resolves keyboard nav targets', () => {
    expect(resolveTreeNavTarget('c', 'parent', rels, byId)).toBe('f');
    expect(resolveTreeNavTarget('f', 'child', rels, byId)).toBe('c');
    expect(resolveTreeNavTarget('c', 'sibling-next', rels, byId)).toBe('s');
  });
});
