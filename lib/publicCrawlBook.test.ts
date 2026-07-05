import { describe, expect, it } from 'vitest';
import type { BookChapter } from '../types';
import { buildBookJsonLd, renderPublicBookHtml, renderPublicBookMarkdown } from './publicCrawlBook';

const sampleChapters: BookChapter[] = [
  {
    kind: 'overview',
    title: 'Our Family',
    narrative: 'A narrative overview.\n\nSecond paragraph.',
  },
  {
    kind: 'person',
    title: 'Anna Hansen',
    personId: '11111111-1111-4111-8111-111111111111',
    narrative: 'Anna was born in Copenhagen.',
    facts: { lifespanLabel: '1840–1912', birthPlace: 'Copenhagen' },
  },
];

const samplePayload = {
  bookId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  treeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  treeName: 'Hansen Family',
  treeSlug: 'hansen-family',
  title: 'The Hansen Book',
  subtitle: 'Three generations',
  chapters: sampleChapters,
  statistics: {
    personCount: 12,
    topSurnames: [],
    topPlaces: [],
    topOccupations: [],
    earliestBirthYear: 1840,
    latestDeathYear: 1950,
  },
  language: 'en' as const,
  createdAt: '2026-07-01T12:00:00.000Z',
};

describe('publicCrawlBook', () => {
  it('renders HTML with title, TOC, and escaped narrative', () => {
    const html = renderPublicBookHtml({ ...samplePayload, origin: 'https://linegra.example' });
    expect(html).toContain('<title>The Hansen Book · Linegra</title>');
    expect(html).toContain('name="robots" content="noai, noimageai"');
    expect(html).toContain('Three generations');
    expect(html).toContain('Anna Hansen');
    expect(html).toContain('A narrative overview.');
    expect(html).not.toContain('<script>alert');
  });

  it('renders markdown with chapter headings', () => {
    const md = renderPublicBookMarkdown({ ...samplePayload, origin: 'https://linegra.example' });
    expect(md).toContain('# The Hansen Book');
    expect(md).toContain('## Anna Hansen');
    expect(md).toContain('[Hansen Family](https://linegra.example/tree/hansen-family)');
  });

  it('builds schema.org Book JSON-LD', () => {
    const jsonLd = buildBookJsonLd({ ...samplePayload, origin: 'https://linegra.example' });
    expect(jsonLd['@type']).toBe('Book');
    expect(jsonLd.name).toBe('The Hansen Book');
    expect(Array.isArray(jsonLd.hasPart)).toBe(true);
  });
});
