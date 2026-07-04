// M5 — Public book share URLs and route parsing.

const BOOK_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isBookId = (value: string | null | undefined): value is string =>
  !!value && BOOK_ID_REGEX.test(value);

/** Read a public book id from `/book/:id` or `?book=:id`. */
export const parseBookRouteFromLocation = (
  loc: Pick<Location, 'pathname' | 'search'> = window.location
): string | null => {
  const pathMatch = loc.pathname.match(/^\/book\/([^/]+)\/?$/i);
  if (pathMatch && isBookId(pathMatch[1])) return pathMatch[1];

  const queryId = new URLSearchParams(loc.search).get('book');
  return isBookId(queryId) ? queryId : null;
};

export const buildPublicBookUrl = (bookId: string, origin?: string): string => {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/book/${bookId}`;
};
