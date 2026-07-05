import { describe, expect, it } from 'vitest';
import type { PublicCrawlRelationshipGroups } from './publicCrawlRelations';
import { buildPersonJsonLd } from './publicCrawlJsonLd';

const rel = (
  name: string,
  href: string,
  relKind: 'parent' | 'spouse' | 'child' | 'sibling',
  relationshipLabel: string
): PublicCrawlRelationshipGroups['parents'][number] => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  treeId: 'tree-1',
  name,
  href,
  rel: relKind,
  relationshipType:
    relKind === 'parent'
      ? 'bio_father'
      : relKind === 'spouse'
        ? 'marriage'
        : relKind === 'child'
          ? 'child'
          : 'bio_father',
  relationshipLabel,
});

describe('buildPersonJsonLd', () => {
  it('emits typed relationship properties instead of relatedTo', () => {
    const jsonLd = buildPersonJsonLd({
      treeId: 'tree-1',
      treeName: 'Example Tree',
      treeSlug: 'example-tree',
      person: {
        id: 'person-1',
        firstName: 'Anna',
        lastName: 'Example',
        birthDate: '1900',
      },
      relationships: {
        parents: [rel('Father Example', 'https://linegra.app/tree/example-tree/person/father', 'parent', 'Father')],
        spouses: [
          {
            ...rel('Spouse Example', 'https://linegra.app/tree/example-tree/person/spouse', 'spouse', 'Spouse'),
            unionRelationshipId: 'union-1',
            familyPageHref: 'https://linegra.app/tree/example-tree/family/union-1',
          },
        ],
        children: [rel('Child Example', 'https://linegra.app/tree/example-tree/person/child', 'child', 'Child')],
        childUnions: [],
        siblings: [rel('Sibling Example', 'https://linegra.app/tree/example-tree/person/sibling', 'sibling', 'Sibling')],
      },
      sources: [],
      origin: 'https://linegra.app',
    });

    expect(jsonLd).not.toHaveProperty('relatedTo');
    expect(jsonLd.parent).toMatchObject({ '@type': 'Person', name: 'Father Example' });
    expect(jsonLd.spouse).toMatchObject({ '@type': 'Person', name: 'Spouse Example' });
    expect(jsonLd.children).toMatchObject({ '@type': 'Person', name: 'Child Example' });
    expect(jsonLd.sibling).toMatchObject({ '@type': 'Person', name: 'Sibling Example' });
  });
});
