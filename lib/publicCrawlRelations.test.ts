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
        { id: FOCUS, treeId: TREE, firstName: 'Ada', lastName: 'Lovelace' },
        { id: FATHER, treeId: TREE, firstName: 'Lord', lastName: 'Byron' },
        { id: CHILD, treeId: TREE, firstName: 'Anne', lastName: 'King' },
      ],
      'https://linegra.app'
    );
    expect(groups.parents).toHaveLength(1);
    expect(groups.parents[0]?.name).toBe('Lord Byron');
    expect(groups.children[0]?.href).toContain(CHILD);
  });
});
