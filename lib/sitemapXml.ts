// Roadmap U3 — shared sitemap XML builders.

export const SITEMAP_FLAT_MAX_URLS = 4500;

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string | null;
}

export const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const renderUrlNodes = (entries: SitemapUrlEntry[]): string =>
  entries
    .map((entry) => {
      const lastmod = entry.lastmod ? entry.lastmod.slice(0, 10) : null;
      return `<url><loc>${xmlEscape(entry.loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('');

export const renderSitemapUrlset = (entries: SitemapUrlEntry[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${renderUrlNodes(entries)}
</urlset>`;

export const renderSitemapIndex = (entries: SitemapUrlEntry[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${renderUrlNodes(entries)}
</sitemapindex>`;

export const extractId8 = (uuid: string): string => uuid.replace(/-/g, '').slice(0, 8).toLowerCase();

export const buildTreeSitemapChunkPath = (treeId: string): string =>
  `/sitemap-tree-${extractId8(treeId)}.xml`;

export const shouldUseSitemapIndex = (
  treeCounts: Array<{ personCount: number }>,
  coreUrlCount: number
): boolean => {
  const personTotal = treeCounts.reduce((sum, row) => sum + row.personCount, 0);
  const total = coreUrlCount + personTotal;
  if (total <= SITEMAP_FLAT_MAX_URLS && treeCounts.length <= 1) return false;
  return total > SITEMAP_FLAT_MAX_URLS || treeCounts.length > 1;
};
