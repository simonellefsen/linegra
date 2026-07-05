// U18g — first-party cookie so Edge middleware can tag signed-in viewer traffic.

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CRAWL_VIEWER_COOKIE = 'linegra_viewer';

const VIEWER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const parseCookieHeader = (cookieHeader: string | null | undefined): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    try {
      cookies[rawKey] = decodeURIComponent(rest.join('='));
    } catch {
      cookies[rawKey] = rest.join('=');
    }
  });
  return cookies;
};

export const normalizeCrawlViewerUserId = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || !UUID_REGEX.test(trimmed)) return null;
  return trimmed;
};

export const extractCrawlViewerUserIdFromCookies = (
  cookieHeader: string | null | undefined
): string | null => normalizeCrawlViewerUserId(parseCookieHeader(cookieHeader)[CRAWL_VIEWER_COOKIE]);

export const extractCrawlViewerUserId = (request: Request): string | null =>
  extractCrawlViewerUserIdFromCookies(request.headers.get('cookie'));

export const setCrawlViewerCookie = (userId: string): void => {
  if (typeof document === 'undefined') return;
  const normalized = normalizeCrawlViewerUserId(userId);
  if (!normalized) return;
  document.cookie = `${CRAWL_VIEWER_COOKIE}=${encodeURIComponent(normalized)}; path=/; max-age=${VIEWER_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
};

export const clearCrawlViewerCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${CRAWL_VIEWER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
};
