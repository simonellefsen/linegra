import { isCrawlerUserAgent } from './lib/crawlerAgents';
import { recordPublicCrawlEvent } from './lib/crawlTelemetry';
import { extractRequestGeo } from './lib/requestGeo';

export const config = {
  matcher: ['/tree/:path*', '/book/:path*'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveVisitorRoute = (
  pathname: string
): { route: 'person' | 'tree' | 'book'; resourceId?: string } | null => {
  const personMatch = pathname.match(/^\/tree\/([^/]+)\/person\/([^/]+)\/?$/i);
  if (personMatch?.[2] && UUID_RE.test(personMatch[2])) {
    return { route: 'person', resourceId: personMatch[2] };
  }

  const treeMatch = pathname.match(/^\/tree\/([^/]+)\/?$/i);
  if (treeMatch?.[1] && UUID_RE.test(treeMatch[1])) {
    return { route: 'tree', resourceId: treeMatch[1] };
  }

  const bookMatch = pathname.match(/^\/book\/([^/]+)/i);
  if (bookMatch?.[1]) {
    const bookId = bookMatch[1];
    return UUID_RE.test(bookId) ? { route: 'book', resourceId: bookId } : { route: 'book' };
  }

  return null;
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get('user-agent');
  const url = new URL(request.url);

  if (isCrawlerUserAgent(userAgent)) {
    const personMatch = url.pathname.match(/^\/tree\/[^/]+\/person\/([^/]+)\/?$/i);
    if (personMatch?.[1]) {
      const apiUrl = new URL(`/api/public/person/${personMatch[1]}?format=html`, url.origin);
      return fetch(apiUrl.toString());
    }

    const treeMatch = url.pathname.match(/^\/tree\/([^/]+)\/?$/i);
    if (treeMatch?.[1]) {
      const apiUrl = new URL(`/api/public/tree/${treeMatch[1]}?format=html`, url.origin);
      return fetch(apiUrl.toString());
    }

    return undefined;
  }

  const visitorRoute = resolveVisitorRoute(url.pathname);
  if (visitorRoute) {
    recordPublicCrawlEvent({
      route: visitorRoute.route,
      userAgent,
      resourceId: visitorRoute.resourceId,
      geo: extractRequestGeo(request),
    });
  }

  return undefined;
}
