import { describe, expect, it } from 'vitest';
import { buildPedigreeLayout } from './pedigreeLayout';
import { buildFanLayout, packPedigreeRows } from './fanLayout';
import type { Person, Relationship } from '../types';

const person = (id: string, firstName: string): Person => ({
  id,
  treeId: 't1',
  firstName,
  lastName: 'Person',
  gender: 'O',
  updatedAt: '2026-07-04T00:00:00Z',
});

const people: Person[] = [
  person('p1', 'Focus'),
  person('p2', 'Father'),
  person('p3', 'Mother'),
  person('p4', 'Grandpa'),
  person('p5', 'Grandma'),
];

const relationships: Relationship[] = [
  { id: 'r1', personId: 'p2', relatedId: 'p1', type: 'bio_father', treeId: 't1' },
  { id: 'r2', personId: 'p3', relatedId: 'p1', type: 'bio_mother', treeId: 't1' },
  { id: 'r3', personId: 'p4', relatedId: 'p2', type: 'bio_father', treeId: 't1' },
  { id: 'r4', personId: 'p5', relatedId: 'p2', type: 'bio_mother', treeId: 't1' },
];

describe('packPedigreeRows', () => {
  it('assigns unique packed rows per column', () => {
    const layout = buildPedigreeLayout(people, relationships, {
      focusId: 'p1',
      maxAncestorDepth: 2,
      maxDescendantDepth: 0,
      allowPlaceholders: false,
    });
    const packed = packPedigreeRows(layout);
    expect(packed.size).toBe(layout.nodes.length);
  });
});

describe('buildFanLayout', () => {
  it('places focus at bottom center and ancestors further out', () => {
    const layout = buildPedigreeLayout(people, relationships, {
      focusId: 'p1',
      maxAncestorDepth: 2,
      maxDescendantDepth: 0,
      allowPlaceholders: false,
    });
    const fan = buildFanLayout(layout);
    const focus = fan.positions.get('p1');
    const father = fan.positions.get('p2');
    const grandpa = fan.positions.get('p4');

    expect(focus).toBeDefined();
    expect(father).toBeDefined();
    expect(grandpa).toBeDefined();
    expect(focus!.centerY).toBeGreaterThan(father!.centerY);
    expect(focus!.centerY).toBeGreaterThan(grandpa!.centerY);

    const dist = (id: string) => {
      const p = fan.positions.get(id)!;
      const dx = p.centerX - fan.focusCenter.x;
      const dy = p.centerY - fan.focusCenter.y;
      return Math.hypot(dx, dy);
    };
    expect(dist('p4')).toBeGreaterThan(dist('p2'));
    expect(dist('p2')).toBeGreaterThan(0);
  });

  it('omits descendant nodes from fan positions', () => {
    const child = person('c1', 'Child');
    const withChild = [
      ...people,
      child,
    ];
    const rels = [
      ...relationships,
      { id: 'r5', personId: 'p1', relatedId: 'c1', type: 'bio_father' as const, treeId: 't1' },
    ];
    const layout = buildPedigreeLayout(withChild, rels, {
      focusId: 'p1',
      maxAncestorDepth: 1,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });
    const fan = buildFanLayout(layout);
    expect(fan.positions.has('c1')).toBe(false);
    expect(fan.positions.has('p1')).toBe(true);
  });
});
