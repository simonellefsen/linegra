import { recordPublicCrawlEvent } from '../../../lib/crawlTelemetry';
import { renderPublicPersonHtml } from '../../../lib/publicCrawlHtml';
import { renderPublicPersonMarkdown } from '../../../lib/publicCrawlMarkdown';
import { buildPersonJsonLd } from '../../../lib/publicCrawlJsonLd';
import { loadPublicPersonCrawlPayload } from '../../../lib/publicCrawlService';
import { getPublicSiteOrigin } from '../../../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const notFound = () =>
  new Response('Person not found or not publicly crawlable.', { status: 404 });

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
  const personId = segments[segments.length - 1];
  if (!personId) return notFound();

  const format = resolveFormat(request);
  recordPublicCrawlEvent({
    route: 'person',
    userAgent: request.headers.get('user-agent'),
    resourceId: personId,
    format,
  });

  const origin = getPublicSiteOrigin(url.origin);
  const payload = await loadPublicPersonCrawlPayload(personId, origin);
  if (!payload) return notFound();

  if (format === 'html') {
    return new Response(renderPublicPersonHtml(payload), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }
  if (format === 'md') {
    return new Response(renderPublicPersonMarkdown(payload), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  }

  return Response.json(
    {
      ...payload,
      jsonLd: buildPersonJsonLd(payload),
      canonicalUrl: `${origin}/tree/${payload.treeId}/person/${payload.person.id}`,
      markdownUrl: `${origin}/api/public/person/${payload.person.id}?format=md`,
      htmlUrl: `${origin}/api/public/person/${payload.person.id}?format=html`,
    },
    {
      headers: { 'Cache-Control': CACHE },
    }
  );
}
