import { isCrawlerUserAgent } from './lib/crawlerAgents';
import { recordPublicCrawlEvent } from './lib/crawlTelemetry';
import { extractRequestGeo } from './lib/requestGeo';
import { checkPublicRateLimit, clientIpFromRequest } from './lib/publicRateLimit';
import { isPublicUuid, parsePersonIdPrefix } from './lib/publicSlugs';
import { resolvePublicPersonId, resolvePublicTreeId } from './lib/publicRouteResolve';
import { resolvePublicUnionRelationshipId } from './lib/publicCrawlService';

export const config = {
  matcher: [
    '/',
    '/trees',
    '/trees/:path*',
    '/tree/:path*',
    '/book/:path*',
    '/api/public/:path*',
    '/api/sitemap.xml',
  ],
};

const resolveVisitorRoute = (
  pathname: string
): { route: 'person' | 'tree' | 'family' | 'book' | 'trees-directory'; resourceId?: string } | null => {
  if (pathname === '/trees' || pathname === '/trees/') {
    return { route: 'trees-directory' };
  }

  const personMatch = pathname.match(/^\/tree\/[^/]+\/person\/([^/]+)\/?$/i);
  if (personMatch?.[1]) {
    return { route: 'person', resourceId: personMatch[1] };
  }

  const familyMatch = pathname.match(/^\/tree\/[^/]+\/family\/([^/]+)\/?$/i);
  if (familyMatch?.[1]) {
    return { route: 'family', resourceId: familyMatch[1] };
  }

  const treeMatch = pathname.match(/^\/tree\/([^/]+)\/?$/i);
  if (treeMatch?.[1]) {
    return { route: 'tree', resourceId: treeMatch[1] };
  }

  const bookMatch = pathname.match(/^\/book\/([^/]+)/i);
  if (bookMatch?.[1]) {
    return { route: 'book', resourceId: bookMatch[1] };
  }

  return null;
};

const resolvePersonIdForCrawler = async (pathname: string): Promise<string | null> => {
  const match = pathname.match(/^\/tree\/([^/]+)\/person\/([^/]+)\/?$/i);
  if (!match?.[1] || !match[2]) return null;
  const personSegment = match[2];
  if (isPublicUuid(personSegment)) return personSegment;
  const idPrefix = parsePersonIdPrefix(personSegment);
  if (!idPrefix) return null;
  const treeId = await resolvePublicTreeId(match[1]);
  if (!treeId) return null;
  return resolvePublicPersonId(treeId, idPrefix);
};

const resolveTreeIdForCrawler = async (pathname: string): Promise<string | null> => {
  const match = pathname.match(/^\/tree\/([^/]+)\/?/i);
  if (!match?.[1]) return null;
  if (isPublicUuid(match[1])) return match[1];
  return resolvePublicTreeId(match[1]);
};

const resolveUnionIdForCrawler = async (pathname: string): Promise<string | null> => {
  const match = pathname.match(/^\/tree\/([^/]+)\/family\/([^/]+)\/?$/i);
  if (!match?.[1] || !match[2]) return null;
  const unionSegment = match[2];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unionSegment)) {
    return unionSegment;
  }
  const treeId = await resolveTreeIdForCrawler(pathname);
  if (!treeId) return null;
  return resolvePublicUnionRelationshipId(treeId, unionSegment.toLowerCase());
};

export default async function middleware(
  request: Request,
  context?: { waitUntil?: (promise: Promise<unknown>) => void }
): Promise<Response | undefined> {
  const userAgent = request.headers.get('user-agent');
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/public') || url.pathname === '/api/sitemap.xml') {
    const rateKey = `${clientIpFromRequest(request)}:${(userAgent ?? 'unknown').slice(0, 80)}`;
    const rate = checkPublicRateLimit(rateKey);
    if (!rate.allowed) {
      return new Response('Too many requests', {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds ?? 60),
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  }

  const wantsMarkdown = (request.headers.get('accept') ?? '').includes('text/markdown');

  if (isCrawlerUserAgent(userAgent) || wantsMarkdown) {
    if (url.pathname === '/trees' || url.pathname === '/trees/') {
      const format = wantsMarkdown ? 'md' : 'html';
      return fetch(new URL(`/api/public/trees?format=${format}`, url.origin).toString());
    }

    if (url.pathname === '/' || url.pathname === '') {
      return fetch(new URL('/api/public/trees?format=html', url.origin).toString());
    }

    if (url.pathname.match(/^\/tree\/[^/]+\/person\/([^/]+)\/?$/i)) {
      const personId = await resolvePersonIdForCrawler(url.pathname);
      if (personId) {
        const apiUrl = new URL(`/api/public/person/${personId}`, url.origin);
        apiUrl.searchParams.set('format', wantsMarkdown ? 'md' : 'html');
        return fetch(apiUrl.toString());
      }
    }

    if (url.pathname.match(/^\/tree\/[^/]+\/family\/([^/]+)\/?$/i)) {
      const unionId = await resolveUnionIdForCrawler(url.pathname);
      if (unionId) {
        const apiUrl = new URL(`/api/public/family/${unionId}`, url.origin);
        apiUrl.searchParams.set('format', wantsMarkdown ? 'md' : 'html');
        return fetch(apiUrl.toString());
      }
    }

    const treeLanding = url.pathname.match(/^\/tree\/([^/]+)\/?$/i);
    if (treeLanding?.[1]) {
      const treeId = await resolveTreeIdForCrawler(url.pathname);
      if (treeId) {
        const apiUrl = new URL(`/api/public/tree/${treeId}`, url.origin);
        apiUrl.searchParams.set('format', wantsMarkdown ? 'md' : 'html');
        return fetch(apiUrl.toString());
      }
    }

    return undefined;
  }

  const visitorRoute = resolveVisitorRoute(url.pathname);
  if (visitorRoute) {
    const recordPromise = recordPublicCrawlEvent({
      route: visitorRoute.route,
      userAgent,
      resourceId: visitorRoute.resourceId,
      geo: extractRequestGeo(request),
    });
    if (context?.waitUntil) {
      context.waitUntil(recordPromise);
    } else {
      await recordPromise;
    }
  }

  return undefined;
}
