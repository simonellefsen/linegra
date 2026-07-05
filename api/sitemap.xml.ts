import { recordPublicCrawlEvent } from '../lib/crawlTelemetry';
import { listPublicTreesDirectory } from '../lib/publicRouteResolve';
import { createServerSupabase } from '../lib/supabaseServer';
import {
  buildPersonUrl,
  buildPublicBookUrl,
  buildTreeUrl,
  buildTreesDirectoryUrl,
  getPublicSiteOrigin,
} from '../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

type SitemapRow = {
  kind: string;
  tree_id: string | null;
  person_id: string | null;
  book_id: string | null;
  updated_at: string | null;
};

const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export default async function handler(request: Request): Promise<Response> {
  await recordPublicCrawlEvent({
    route: 'sitemap',
    userAgent: request.headers.get('user-agent'),
    format: 'xml',
  });

  const origin = getPublicSiteOrigin(new URL(request.url).origin);
  const supabase = createServerSupabase();
  const [{ data, error }, directory] = await Promise.all([
    supabase.rpc('list_public_sitemap_entries', { entry_limit: 10000 }),
    listPublicTreesDirectory(),
  ]);
  if (error) {
    return new Response(`Sitemap unavailable: ${error.message}`, { status: 503 });
  }

  const slugByTreeId = new Map(directory.map((tree) => [tree.treeId, tree.slug]));
  const rows = (data ?? []) as SitemapRow[];
  const urls = rows
    .map((row) => {
      let loc = origin;
      if (row.kind === 'tree' && row.tree_id) {
        loc = buildTreeUrl({ id: row.tree_id, slug: slugByTreeId.get(row.tree_id) ?? null }, origin);
      }
      if (row.kind === 'person' && row.tree_id && row.person_id) {
        loc = buildPersonUrl({ id: row.tree_id, slug: slugByTreeId.get(row.tree_id) ?? null }, row.person_id, origin);
      }
      if (row.kind === 'book' && row.book_id) loc = buildPublicBookUrl(row.book_id, origin);
      const lastmod = row.updated_at ? row.updated_at.slice(0, 10) : null;
      return `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${xmlEscape(origin)}</loc></url>
<url><loc>${xmlEscape(buildTreesDirectoryUrl(origin))}</loc></url>
${urls}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE,
    },
  });
}
