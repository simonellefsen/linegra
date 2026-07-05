import { describe, expect, it } from 'vitest';
import {
  CRAWL_VIEWER_COOKIE,
  extractCrawlViewerUserId,
  extractCrawlViewerUserIdFromCookies,
  normalizeCrawlViewerUserId,
  parseCookieHeader,
} from './crawlViewerCookie';

const userId = '11111111-1111-4111-8111-111111111111';

describe('crawlViewerCookie', () => {
  it('parses the viewer cookie from a request', () => {
    const request = new Request('https://linegra.example/tree/foo', {
      headers: {
        cookie: `theme=dark; ${CRAWL_VIEWER_COOKIE}=${userId}`,
      },
    });
    expect(extractCrawlViewerUserId(request)).toBe(userId);
  });

  it('rejects invalid viewer cookie values', () => {
    expect(
      extractCrawlViewerUserIdFromCookies(`${CRAWL_VIEWER_COOKIE}=not-a-uuid`)
    ).toBeNull();
    expect(normalizeCrawlViewerUserId('')).toBeNull();
  });

  it('parses cookie header pairs', () => {
    expect(parseCookieHeader('a=1; b=hello%20world').b).toBe('hello world');
  });
});
