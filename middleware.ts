import { isCrawlerUserAgent } from './lib/crawlerAgents';

export const config = {
  matcher: ['/tree/:path*', '/book/:path*'],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  if (!isCrawlerUserAgent(request.headers.get('user-agent'))) {
    return undefined;
  }

  const url = new URL(request.url);
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
