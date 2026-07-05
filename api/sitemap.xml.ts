import { apiErrorResponse } from '../lib/apiErrorTelemetry';
import { recordPublicCrawlEvent } from '../lib/crawlTelemetry';
import { buildSitemap } from '../lib/sitemapService';
import { renderSitemapIndex, renderSitemapUrlset } from '../lib/sitemapXml';
import { getPublicSiteOrigin } from '../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

export default async function handler(request: Request): Promise<Response> {
  await recordPublicCrawlEvent({
    route: 'sitemap',
    userAgent: request.headers.get('user-agent'),
    format: 'xml',
  });

  const origin = getPublicSiteOrigin(new URL(request.url).origin);
  try {
    const result = await buildSitemap(origin);
    const body =
      result.mode === 'index'
        ? renderSitemapIndex(result.indexEntries ?? [])
        : renderSitemapUrlset(result.flatEntries ?? []);

    return new Response(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': CACHE,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sitemap unavailable';
    return apiErrorResponse('public-api', '/api/sitemap.xml', `Sitemap unavailable: ${message}`, {
      status: 503,
    });
  }
}
