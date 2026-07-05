import { describe, expect, it } from 'vitest';
import { bucketPublicCrawlRelationships } from './publicCrawlRelations';
import type { Relationship } from '../types';

const TREE = '11111111-1111-4111-8111-111111111111';
const FOCUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FATHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHILD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('publicCrawlRelations', () => {
  it('buckets parents and children with crawlable links', () => {
    const relationships: Relationship[] = [
      {
        id: 'r1',
        treeId: TREE,
        personId: FATHER,
        relatedId: FOCUS,
        type: 'bio_father',
        status: 'current',
      },
      {
        id: 'r2',
        treeId: TREE,
        personId: FOCUS,
        relatedId: CHILD,
        type: 'bio_father',
        status: 'current',
      },
    ];
    const groups = bucketPublicCrawlRelationships(
      FOCUS,
      TREE,
      relationships,
      [
        { id: FOCUS, treeId: TREE, firstName: 'Ada', lastName: 'Lovelace', gender: 'F' },
        { id: FATHER, treeId: TREE, firstName: 'Lord', lastName: 'Byron', gender: 'M', birthDate: '1788', deathDate: '1824' },
        {
          id: CHILD,
          treeId: TREE,
          firstName: 'Anne',
          lastName: 'King',
          gender: 'F',
          birthDate: '1840',
          deathDate: '1910',
        },
      ],
      'https://linegra.app'
    );
    expect(groups.parents).toHaveLength(1);
    expect(groups.parents[0]?.relationshipLabel).toBe('Father');
    expect(groups.parents[0]?.name).toBe('Lord Byron (1788–1824)');
    expect(groups.children[0]?.relationshipLabel).toBe('Daughter');
    expect(groups.children[0]?.name).toBe('Anne King (1840–1910)');
    expect(groups.children[0]?.href).toContain(CHILD);
    expect(groups.children[0]?.rel).toBe('child');
    expect(groups.children[0]?.relationshipType).toBe('child');
  });

  it('labels siblings as siblings, not with the parental role', () => {
    const SIBLING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const groups = bucketPublicCrawlRelationships(
      FOCUS,
      TREE,
      [
        {
          id: 'r1',
          treeId: TREE,
          personId: FATHER,
          relatedId: FOCUS,
          type: 'bio_father',
          status: 'current',
        },
        {
          id: 'r2',
          treeId: TREE,
          personId: FATHER,
          relatedId: SIBLING,
          type: 'bio_father',
          status: 'current',
        },
      ],
      [
        { id: FOCUS, treeId: TREE, firstName: 'Ada', lastName: 'Lovelace' },
        { id: FATHER, treeId: TREE, firstName: 'Lord', lastName: 'Byron' },
        { id: SIBLING, treeId: TREE, firstName: 'Byron', lastName: 'King' },
      ],
      'https://linegra.app'
    );
    expect(groups.siblings).toHaveLength(1);
    expect(groups.siblings[0]?.relationshipLabel).toBe('Sibling');
    expect(groups.siblings[0]?.rel).toBe('sibling');
  });
});
