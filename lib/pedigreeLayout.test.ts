import { describe, expect, it } from 'vitest';
import { buildPedigreeLayout } from './pedigreeLayout';
import type { Person, Relationship } from '../types';

const person = (
  id: string,
  firstName: string,
  gender: Person['gender'] = 'O',
  lastName = 'Test'
): Person => ({
  id,
  treeId: 't1',
  firstName,
  lastName,
  gender,
  updatedAt: '2026-07-05T00:00:00Z',
});

describe('buildPedigreeLayout', () => {
  it('shows coparent beside focus and union parent edges to shared children', () => {
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const child = person('kid', 'Ewaldine', 'F', 'Hagenzieker');
    const people = [margaretha, wilhelm, child];
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'kid', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'mom', relatedId: 'kid', type: 'bio_mother', treeId: 't1' },
    ];

    const layout = buildPedigreeLayout(people, relationships, {
      focusId: 'mom',
      maxAncestorDepth: 1,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });

    expect(layout.nodes.some((node) => node.id === 'dad')).toBe(true);
    expect(layout.edges.filter((edge) => edge.type === 'parent' && edge.toId === 'kid')).toHaveLength(2);
    expect(layout.edges.some((edge) => edge.type === 'spouse')).toBe(true);
  });

  it('renders spouses beside focus instead of as children', () => {
    const wilhelmina = person('wife', 'Wilhelmina', 'F', 'Wouters');
    const george = person('husband', 'George', 'M', 'Kazanis');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'wife', relatedId: 'husband', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'wife', relatedId: 'husband', type: 'child', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout([wilhelmina, george], relationships, {
      focusId: 'wife',
      maxAncestorDepth: 0,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });
    expect(layout.edges.some((edge) => edge.type === 'spouse')).toBe(true);
    expect(layout.edges.some((edge) => edge.type === 'parent' && edge.toId === 'husband')).toBe(false);
  });
});
