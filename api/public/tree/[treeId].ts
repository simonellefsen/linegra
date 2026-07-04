import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import { renderPublicTreeHtml } from '../../../lib/publicCrawlHtml';
import { loadPublicTreeCrawlPayload } from '../../../lib/publicCrawlService';
import { buildTreeUrl, getPublicSiteOrigin } from '../../../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const treeId = segments[segments.length - 1];
  if (!treeId) {
    return new Response('Tree not found.', { status: 404 });
  }

  const format = url.searchParams.get('format') ?? 'html';
  recordPublicCrawlEvent({
    route: 'tree',
    userAgent: request.headers.get('user-agent'),
    resourceId: treeId,
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const payload = await loadPublicTreeCrawlPayload(treeId);
  if (!payload) {
    return new Response('Tree not found or not public.', { status: 404 });
  }

  if (format === 'json') {
    return Response.json(
      {
        ...payload,
        canonicalUrl: buildTreeUrl(treeId, origin),
        personCount: payload.persons.length,
      },
      { headers: { 'Cache-Control': CACHE } }
    );
  }

  return new Response(renderPublicTreeHtml({ ...payload, origin }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE,
    },
  });
}
