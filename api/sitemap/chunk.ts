import { apiErrorResponse } from '../../lib/apiErrorTelemetry';
import { recordPublicCrawlEvent } from '../../lib/crawlTelemetry';
import {
  buildSitemapCoreChunk,
  buildSitemapTreeChunk,
  parseSitemapChunkName,
} from '../../lib/sitemapService';
import { renderSitemapUrlset } from '../../lib/sitemapXml';
import { getPublicSiteOrigin } from '../../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const chunk = url.searchParams.get('chunk') ?? '';
  const parsed = parseSitemapChunkName(chunk);
  if (!parsed) {
    return apiErrorResponse('public-api', '/api/sitemap/chunk', 'Unknown sitemap chunk.', {
      status: 404,
    });
  }

  await recordPublicCrawlEvent({
    route: 'sitemap',
    userAgent: request.headers.get('user-agent'),
    format: 'xml',
  });

  const origin = getPublicSiteOrigin(url.origin);
  try {
    const entries =
      parsed.kind === 'core'
        ? await buildSitemapCoreChunk(origin)
        : await buildSitemapTreeChunk(parsed.id8, origin);
    if (!entries) {
      return apiErrorResponse('public-api', '/api/sitemap/chunk', 'Tree sitemap not found.', {
        status: 404,
      });
    }

    return new Response(renderSitemapUrlset(entries), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sitemap chunk unavailable';
    return apiErrorResponse('public-api', '/api/sitemap/chunk', message, { status: 503 });
  }
}
