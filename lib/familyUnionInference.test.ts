import { describe, expect, it } from 'vitest';
import type { Person, Relationship } from '../types';
import { findCoparentSuggestions } from './familyUnionInference';

const rel = (partial: Partial<Relationship> & Pick<Relationship, 'id' | 'personId' | 'relatedId' | 'type'>): Relationship =>
  ({
    treeId: 'tree',
    status: 'current',
    confidence: 'Unknown',
    ...partial,
  }) as Relationship;

const person = (id: string, lastName: string): Person =>
  ({
    id,
    treeId: 'tree',
    firstName: id,
    lastName,
    gender: 'O',
    isPrivate: false,
  }) as Person;

describe('familyUnionInference', () => {
  it('suggests a coparent who shares a child', () => {
    const people = {
      johannes: person('johannes', 'Nielsen'),
      sorine: person('sorine', 'Nielsen'),
      jytte: person('jytte', 'Michaelsen'),
    };
    const relationships = [
      rel({ id: 'r1', personId: 'johannes', relatedId: 'jytte', type: 'bio_father' }),
      rel({ id: 'r2', personId: 'sorine', relatedId: 'jytte', type: 'bio_mother' }),
    ];
    const suggestions = findCoparentSuggestions('johannes', relationships, people, { canViewPrivate: true });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.person.id).toBe('sorine');
    expect(suggestions[0]?.sharedChildren.map((entry) => entry.person.id)).toEqual(['jytte']);
  });
});
