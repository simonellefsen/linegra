import { describe, expect, it } from 'vitest';
import type { Person, Relationship } from '../types';
import {
  indexParentChildLinks,
  inferParentPairsForUnion,
  inferParentRelationshipType,
  parentLinkReadsAsFather,
} from './parentChildLinks';

const rel = (partial: Partial<Relationship> & Pick<Relationship, 'id' | 'personId' | 'relatedId' | 'type'>): Relationship =>
  ({
    treeId: 'tree',
    status: 'current',
    confidence: 'Unknown',
    ...partial,
  }) as Relationship;

const person = (id: string, gender: Person['gender']): Person =>
  ({
    id,
    treeId: 'tree',
    firstName: id,
    lastName: 'Test',
    gender,
    isPrivate: false,
  }) as Person;

describe('parentChildLinks', () => {
  it('indexes generic child edges for pedigree walks', () => {
    const relationships = [rel({ id: 'r1', personId: 'dad', relatedId: 'kid', type: 'child' })];
    const { parentLinksByChild, childLinksByParent } = indexParentChildLinks(relationships);
    expect(parentLinksByChild.get('kid')?.map((r) => r.id)).toEqual(['r1']);
    expect(childLinksByParent.get('dad')?.map((r) => r.id)).toEqual(['r1']);
  });

  it('infers typed parent links from gender', () => {
    expect(inferParentRelationshipType('M')).toBe('bio_father');
    expect(inferParentRelationshipType('F')).toBe('bio_mother');
    expect(inferParentRelationshipType('O')).toBe('child');
  });

  it('treats generic child links as father when parent is male', () => {
    const link = rel({ id: 'r1', personId: 'dad', relatedId: 'kid', type: 'child' });
    expect(parentLinkReadsAsFather(link, person('dad', 'M'))).toBe(true);
  });

  it('pairs father and mother links for automatic union inference', () => {
    expect(
      inferParentPairsForUnion([
        { parentId: 'rasmus', type: 'bio_father' },
        { parentId: 'martha', type: 'bio_mother' },
      ])
    ).toEqual([['rasmus', 'martha']]);
    expect(
      inferParentPairsForUnion([
        { parentId: 'dad', type: 'child', gender: 'M' },
        { parentId: 'mom', type: 'child', gender: 'F' },
      ])
    ).toEqual([['dad', 'mom']]);
    expect(inferParentPairsForUnion([{ parentId: 'dad', type: 'bio_father' }])).toEqual([]);
  });
});
