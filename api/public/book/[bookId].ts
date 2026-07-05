import { apiErrorResponse } from '../../../lib/apiErrorTelemetry';
import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import {
  buildBookJsonLd,
  loadPublicBookCrawlPayload,
  renderPublicBookHtml,
  renderPublicBookMarkdown,
} from '../../../lib/publicCrawlBook';
import { buildPublicBookUrl, getPublicSiteOrigin } from '../../../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const ROUTE = '/api/public/book/:id';

const notFound = () =>
  apiErrorResponse('public-api', ROUTE, 'Book not found or not publicly shared.', { status: 404 });

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
  const bookSegment = segments[segments.length - 1];
  if (!bookSegment) return notFound();

  const format = resolveFormat(request);
  await recordPublicCrawlEvent({
    route: 'book',
    userAgent: request.headers.get('user-agent'),
    resourceId: bookSegment,
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const payload = await loadPublicBookCrawlPayload(bookSegment);
  if (!payload) return notFound();

  if (format === 'html') {
    return new Response(renderPublicBookHtml({ ...payload, origin }), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }
  if (format === 'md') {
    return new Response(renderPublicBookMarkdown({ ...payload, origin }), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }

  return Response.json(
    {
      ...payload,
      jsonLd: buildBookJsonLd({ ...payload, origin }),
      canonicalUrl: buildPublicBookUrl(payload.bookId, origin),
      markdownUrl: `${origin}/api/public/book/${payload.bookId}?format=md`,
      htmlUrl: `${origin}/api/public/book/${payload.bookId}?format=html`,
    },
    {
      headers: { 'Cache-Control': CACHE },
    }
  );
}
