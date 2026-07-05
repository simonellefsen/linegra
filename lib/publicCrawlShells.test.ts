import { describe, expect, it } from 'vitest';
import { renderPublicPersonHtml } from './publicCrawlHtml';
import { buildPersonJsonLd } from './publicCrawlJsonLd';
import { renderPublicPersonMarkdown } from './publicCrawlMarkdown';
import { bucketPublicCrawlRelationships } from './publicCrawlRelations';
import type { Relationship } from '../types';

const TREE = '11111111-1111-4111-8111-111111111111';
const FOCUS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FATHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHILD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

const people = [
  { id: FOCUS, treeId: TREE, firstName: 'Ada', lastName: 'Lovelace', gender: 'F' as const },
  {
    id: FATHER,
    treeId: TREE,
    firstName: 'Lord',
    lastName: 'Byron',
    gender: 'M' as const,
    birthDate: '1788',
    deathDate: '1824',
  },
  {
    id: CHILD,
    treeId: TREE,
    firstName: 'Anne',
    lastName: 'King',
    gender: 'F' as const,
    birthDate: '1840',
    deathDate: '1910',
  },
];

describe('public crawl shells', () => {
  const relationshipGroups = bucketPublicCrawlRelationships(
    FOCUS,
    TREE,
    relationships,
    people,
    'https://linegra.app'
  );

  const shellInput = {
    treeId: TREE,
    treeName: 'Example Tree',
    person: {
      id: FOCUS,
      firstName: 'Ada',
      lastName: 'Lovelace',
      birthDate: '1815',
      deathDate: '1852',
    },
    relationships: relationshipGroups,
    origin: 'https://linegra.app',
  };

  it('renders lifespans on relation anchors in HTML', () => {
    const html = renderPublicPersonHtml(shellInput);
    expect(html).toContain('Lord Byron (1788–1824)');
    expect(html).toContain('Anne King (1840–1910)');
    expect(html).toContain('(Father)');
    expect(html).toContain('(Daughter)');
  });

  it('renders lifespans on relation anchors in Markdown', () => {
    const markdown = renderPublicPersonMarkdown(shellInput);
    expect(markdown).toContain('[Lord Byron (1788–1824)]');
    expect(markdown).toContain('[Anne King (1840–1910)]');
    expect(markdown).toContain('Daughter:');
  });

  it('includes lifespans in JSON-LD related person names', () => {
    const jsonLd = buildPersonJsonLd(shellInput);
    expect(jsonLd.parent).toMatchObject({ name: 'Lord Byron (1788–1824)' });
    expect(jsonLd.children).toMatchObject({ name: 'Anne King (1840–1910)' });
  });
});
