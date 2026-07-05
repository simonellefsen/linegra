import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import { renderPublicTreesDirectoryHtml } from '../../../lib/publicCrawlHtml';
import { listPublicTreesDirectory } from '../../../lib/publicRouteResolve';
import { buildTreeUrl, getPublicSiteOrigin } from '../../../lib/publicRoutes';
import type { PublicTreeDirectoryEntry } from '../../../lib/publicRouteResolve';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'html';
  await recordPublicCrawlEvent({
    route: 'tree',
    userAgent: request.headers.get('user-agent'),
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const trees = await listPublicTreesDirectory();

  if (format === 'json') {
    return Response.json(
      {
        trees: trees.map((tree: PublicTreeDirectoryEntry) => ({
          ...tree,
          href: buildTreeUrl({ id: tree.treeId, slug: tree.slug }, origin),
        })),
      },
      { headers: { 'Cache-Control': CACHE } }
    );
  }

  if (format === 'md') {
    const lines = trees.map(
      (tree: PublicTreeDirectoryEntry) =>
        `- [${tree.name}](${buildTreeUrl({ id: tree.treeId, slug: tree.slug }, origin)}) — ${tree.personCount} persons`
    );
    return new Response(
      ['# Public family trees', '', ...lines, ''].join('\n'),
      {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': CACHE,
        },
      }
    );
  }

  return new Response(renderPublicTreesDirectoryHtml({ trees, origin }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE,
    },
  });
}
