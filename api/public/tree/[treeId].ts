import { apiErrorResponse } from '../../../lib/apiErrorTelemetry';
import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import { renderPublicTreeHtml, renderPublicTreeMarkdown } from '../../../lib/publicCrawlHtml';
import { loadPublicTreeCrawlPayload } from '../../../lib/publicCrawlService';
import { resolvePublicTreeId } from '../../../lib/publicRouteResolve';
import { buildTreeUrl, getPublicSiteOrigin } from '../../../lib/publicRoutes';
import { isPublicUuid } from '../../../lib/publicSlugs';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const ROUTE = '/api/public/tree/:id';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const segment = segments[segments.length - 1];
  if (!segment) {
    return apiErrorResponse('public-api', ROUTE, 'Tree not found.', { status: 404 });
  }

  const format = url.searchParams.get('format') ?? 'html';
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = 500;
  const rowOffset = (page - 1) * pageSize;

  const treeId = isPublicUuid(segment) ? segment : await resolvePublicTreeId(segment);
  if (!treeId) {
    return apiErrorResponse('public-api', ROUTE, 'Tree not found or not public.', { status: 404 });
  }

  await recordPublicCrawlEvent({
    route: 'tree',
    userAgent: request.headers.get('user-agent'),
    resourceId: treeId,
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const payload = await loadPublicTreeCrawlPayload(treeId, rowOffset, pageSize);
  if (!payload) {
    return apiErrorResponse('public-api', ROUTE, 'Tree not found or not public.', { status: 404 });
  }

  if (format === 'json') {
    return Response.json(
      {
        ...payload,
        canonicalUrl: buildTreeUrl({ id: payload.treeId, slug: payload.treeSlug }, origin),
        personCount: payload.persons.length,
        page,
        pageSize,
      },
      { headers: { 'Cache-Control': CACHE } }
    );
  }

  if (format === 'md') {
    return new Response(renderPublicTreeMarkdown({ ...payload, origin, page }), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }

  return new Response(renderPublicTreeHtml({ ...payload, origin, page }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE,
    },
  });
}
