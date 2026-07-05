import { apiErrorResponse } from '../../../lib/apiErrorTelemetry';
import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import { renderPublicFamilyHtml } from '../../../lib/publicCrawlHtml';
import { renderPublicFamilyMarkdown } from '../../../lib/publicCrawlMarkdown';
import { buildFamilyJsonLd } from '../../../lib/publicCrawlJsonLd';
import { loadPublicFamilyCrawlPayload } from '../../../lib/publicCrawlService';
import { getPublicSiteOrigin } from '../../../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const ROUTE = '/api/public/family/:id';

const notFound = () =>
  apiErrorResponse('public-api', ROUTE, 'Family union not found or not publicly crawlable.', {
    status: 404,
  });

const resolveFormat = (request: Request): 'json' | 'md' | 'html' => {
  const url = new URL(request.url);
  const explicit = url.searchParams.get('format');
  if (explicit === 'md' || explicit === 'markdown') return 'md';
  if (explicit === 'html') return 'html';
  if (explicit === 'json') return 'json';
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/markdown')) return 'md';
  if (accept.includes('text/html') && !accept.includes('application/json')) return 'html';
  return 'json';
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const unionId = segments[segments.length - 1];
  if (!unionId) return notFound();

  const format = resolveFormat(request);
  await recordPublicCrawlEvent({
    route: 'family',
    userAgent: request.headers.get('user-agent'),
    resourceId: unionId,
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const payload = await loadPublicFamilyCrawlPayload(unionId, origin);
  if (!payload) return notFound();

  if (format === 'html') {
    return new Response(renderPublicFamilyHtml({ ...payload, origin }), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }
  if (format === 'md') {
    return new Response(renderPublicFamilyMarkdown({ ...payload, origin }), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }

  return Response.json(
    {
      ...payload,
      jsonLd: buildFamilyJsonLd({ ...payload, origin }),
      markdownUrl: `${origin}/api/public/family/${payload.union.id}?format=md`,
      htmlUrl: `${origin}/api/public/family/${payload.union.id}?format=html`,
    },
    {
      headers: { 'Cache-Control': CACHE },
    }
  );
}
