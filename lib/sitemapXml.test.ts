import { describe, expect, it } from 'vitest';
import {
  buildTreeSitemapChunkPath,
  renderSitemapIndex,
  renderSitemapUrlset,
  shouldUseSitemapIndex,
  xmlEscape,
} from './sitemapXml';

describe('sitemapXml', () => {
  it('escapes XML entities', () => {
    expect(xmlEscape('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('renders urlset entries', () => {
    const xml = renderSitemapUrlset([
      { loc: 'https://linegra.app/', lastmod: '2026-07-05T12:00:00Z' },
      { loc: 'https://linegra.app/trees' },
    ]);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<loc>https://linegra.app/</loc>');
    expect(xml).toContain('<lastmod>2026-07-05</lastmod>');
  });

  it('renders sitemap index entries', () => {
    const xml = renderSitemapIndex([{ loc: 'https://linegra.app/sitemap-core.xml' }]);
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('sitemap-core.xml');
  });

  it('uses index when multiple trees or URL budget exceeded', () => {
    expect(shouldUseSitemapIndex([{ personCount: 100 }, { personCount: 50 }], 4)).toBe(true);
    expect(shouldUseSitemapIndex([{ personCount: 5000 }], 4)).toBe(true);
    expect(shouldUseSitemapIndex([{ personCount: 100 }], 4)).toBe(false);
  });

  it('builds per-tree chunk paths from uuid', () => {
    expect(buildTreeSitemapChunkPath('11111111-1111-4111-8111-111111111111')).toBe(
      '/sitemap-tree-11111111.xml'
    );
  });
});
