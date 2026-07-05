import { describe, expect, it } from 'vitest';
import { bucketPublicCrawlRelationships } from './publicCrawlRelations';
import type { Relationship } from '../types';
import {
  childrenSharedByParents,
  formatSpouseRelationshipLabel,
  formatUnionFactsSuffix,
  groupChildIdsByCoparent,
  matchUnionIdPrefix,
} from './publicCrawlUnions';

const TREE = '11111111-1111-4111-8111-111111111111';
const FOCUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SPOUSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHILD_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHILD_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_PARENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UNION_ID = '99999999-9999-4999-8999-999999999999';

describe('publicCrawlUnions', () => {
  it('formats marriage facts for spouse labels', () => {
    expect(formatUnionFactsSuffix('1892', 'Copenhagen')).toBe(' (m. 1892, Copenhagen)');
    expect(formatSpouseRelationshipLabel('marriage', '1892', 'Copenhagen')).toBe(
      'Spouse, m. 1892, Copenhagen'
    );
  });

  it('matches union id8 prefixes', () => {
    expect(matchUnionIdPrefix(UNION_ID, '99999999')).toBe(true);
    expect(matchUnionIdPrefix(UNION_ID, 'aaaaaaaa')).toBe(false);
  });

  it('groups children by coparent and lists shared union children', () => {
    const relationships: Relationship[] = [
      {
        id: UNION_ID,
        treeId: TREE,
        personId: FOCUS,
        relatedId: SPOUSE,
        type: 'marriage',
        status: 'current',
        date: '1892',
        place: 'Copenhagen',
      },
      {
        id: 'r-child-a',
        treeId: TREE,
        personId: FOCUS,
        relatedId: CHILD_A,
        type: 'bio_father',
        status: 'current',
      },
      {
        id: 'r-child-a-mother',
        treeId: TREE,
        personId: SPOUSE,
        relatedId: CHILD_A,
        type: 'bio_mother',
        status: 'current',
      },
      {
        id: 'r-child-b',
        treeId: TREE,
        personId: FOCUS,
        relatedId: CHILD_B,
        type: 'bio_father',
        status: 'current',
      },
      {
        id: 'r-child-b-other',
        treeId: TREE,
        personId: OTHER_PARENT,
        relatedId: CHILD_B,
        type: 'bio_mother',
        status: 'current',
      },
    ];
    const people = [
      { id: FOCUS, treeId: TREE, firstName: 'Jens', lastName: 'Jensen', gender: 'M' as const },
      { id: SPOUSE, treeId: TREE, firstName: 'Anna', lastName: 'Hansen', gender: 'F' as const },
      { id: CHILD_A, treeId: TREE, firstName: 'Peter', lastName: 'Jensen', gender: 'M' as const },
      { id: CHILD_B, treeId: TREE, firstName: 'Maria', lastName: 'Jensen', gender: 'F' as const },
      {
        id: OTHER_PARENT,
        treeId: TREE,
        firstName: 'Else',
        lastName: 'Nielsen',
        gender: 'F' as const,
      },
    ];
    const peopleById = new Map(people.map((person) => [person.id, person]));

    const groups = bucketPublicCrawlRelationships(
      FOCUS,
      TREE,
      relationships,
      people,
      'https://linegra.app'
    );
    expect(groups.spouses).toHaveLength(1);
    expect(groups.spouses[0]?.relationshipLabel).toBe('Spouse, m. 1892, Copenhagen');
    expect(groups.spouses[0]?.familyPageHref).toContain('/family/99999999');
    expect(groups.childUnions).toHaveLength(2);
    const headings = groups.childUnions.map((group) => group.heading);
    expect(headings).toContain('Children with Anna Hansen');
    expect(headings).toContain('Children with Else Nielsen');
    const annaGroup = groups.childUnions.find((group) => group.heading.includes('Anna'));
    expect(annaGroup?.children.map((child) => child.id)).toEqual([CHILD_A]);

    const shared = childrenSharedByParents(FOCUS, SPOUSE, relationships);
    expect(shared).toEqual([CHILD_A]);

    const grouped = groupChildIdsByCoparent([CHILD_A, CHILD_B], FOCUS, relationships, peopleById);
    expect(grouped).toEqual([
      { coparentId: SPOUSE, childIds: [CHILD_A] },
      { coparentId: OTHER_PARENT, childIds: [CHILD_B] },
    ]);
  });
});
