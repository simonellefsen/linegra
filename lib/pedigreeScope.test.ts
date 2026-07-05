import { describe, expect, it } from 'vitest';
import { computePedigreeScope } from './pedigreeScope';
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

describe('computePedigreeScope', () => {
  it('marks descendant hints only for people with hidden children', () => {
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const wilhelmina = person('kid1', 'Wilhelmina', 'F', 'Wouters');
    const ewaldine = person('kid2', 'Ewaldine', 'F', 'Hagenzieker');
    const grandchild = person('gc', 'E.G.', 'M', 'Kazanis');
    const people = [wilhelm, wilhelmina, ewaldine, grandchild];
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'kid1', type: 'bio_father', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'kid2', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'kid1', relatedId: 'gc', type: 'bio_mother', treeId: 't1' },
    ];

    const scope = computePedigreeScope(people, relationships, 'dad', 0, 1);

    expect(scope.childHints['kid1']).toBe(true);
    expect(scope.descendantHints['kid1']).toBe(true);
    expect(scope.childHints['kid2']).toBeUndefined();
    expect(scope.descendantHints['kid2']).toBeUndefined();
  });

  it('flags the focus person when siblings are outside the pedigree scope', () => {
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const wilhelmina = person('kid1', 'Wilhelmina', 'F', 'Wouters');
    const ewaldine = person('kid2', 'Ewaldine', 'F', 'Hagenzieker');
    const people = [wilhelmina, wilhelm, margaretha, ewaldine];
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'kid1', type: 'bio_father', treeId: 't1' },
      { id: 'r2', personId: 'mom', relatedId: 'kid1', type: 'bio_mother', treeId: 't1' },
      { id: 'r3', personId: 'dad', relatedId: 'kid2', type: 'bio_father', treeId: 't1' },
      { id: 'r4', personId: 'mom', relatedId: 'kid2', type: 'bio_mother', treeId: 't1' },
      { id: 'r5', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
    ];
    const scopedRelationships = relationships.filter((rel) =>
      ['r1', 'r2', 'r5'].includes(rel.id)
    );
    const scope = computePedigreeScope(
      [wilhelmina, wilhelm, margaretha],
      scopedRelationships,
      'kid1',
      2,
      1,
      people,
      relationships
    );
    expect(scope.siblingHints['kid1']).toBe(true);
  });
});
