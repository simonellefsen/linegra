// Roadmap U2 — stable public URL scheme for trees, persons, and books.

import { parseBookRouteFromLocation } from './bookShare';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPublicUuid = (value: string | null | undefined): value is string =>
  !!value && UUID_REGEX.test(value);

export type PublicRoute =
  | { kind: 'home' }
  | { kind: 'book'; bookId: string }
  | { kind: 'tree'; treeId: string; legacy?: boolean }
  | { kind: 'person'; treeId: string; personId: string; legacy?: boolean };

const readRuntimeEnv = (): Record<string, string | undefined> => {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env ?? {};
};

export const getPublicSiteOrigin = (origin?: string): string => {
  if (origin) return origin.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  const env = readRuntimeEnv();
  return (env.VITE_APP_URL ?? env.APP_URL ?? 'https://linegra.app').replace(/\/$/, '');
};

export const buildTreeUrl = (treeId: string, origin?: string): string =>
  `${getPublicSiteOrigin(origin)}/tree/${treeId}`;

export const buildPersonUrl = (treeId: string, personId: string, origin?: string): string =>
  `${getPublicSiteOrigin(origin)}/tree/${treeId}/person/${personId}`;

export const buildPublicBookUrl = (bookId: string, origin?: string): string =>
  `${getPublicSiteOrigin(origin)}/book/${bookId}`;

/** Parse `/tree/:id`, `/tree/:id/person/:pid`, `/book/:id`, or legacy `?tree=&person=`. */
export const parsePublicRouteFromLocation = (
  loc: Pick<Location, 'pathname' | 'search'> = typeof window !== 'undefined'
    ? window.location
    : { pathname: '/', search: '' }
): PublicRoute => {
  const bookId = parseBookRouteFromLocation(loc);
  if (bookId) return { kind: 'book', bookId };

  const personMatch = loc.pathname.match(/^\/tree\/([^/]+)\/person\/([^/]+)\/?$/i);
  if (personMatch && isPublicUuid(personMatch[1]) && isPublicUuid(personMatch[2])) {
    return { kind: 'person', treeId: personMatch[1], personId: personMatch[2] };
  }

  const treeMatch = loc.pathname.match(/^\/tree\/([^/]+)\/?$/i);
  if (treeMatch && isPublicUuid(treeMatch[1])) {
    return { kind: 'tree', treeId: treeMatch[1] };
  }

  const params = new URLSearchParams(loc.search);
  const treeId = params.get('tree');
  const personId = params.get('person');
  if (treeId && isPublicUuid(treeId) && personId && isPublicUuid(personId)) {
    return { kind: 'person', treeId, personId, legacy: true };
  }
  if (treeId && isPublicUuid(treeId)) {
    return { kind: 'tree', treeId, legacy: true };
  }

  return { kind: 'home' };
};

/** Convert legacy query URLs to canonical path URLs (returns null when already canonical). */
export const canonicalizeLegacyPublicUrl = (
  loc: Pick<Location, 'pathname' | 'search' | 'hash'> = typeof window !== 'undefined'
    ? window.location
    : { pathname: '/', search: '', hash: '' },
  origin?: string
): string | null => {
  const route = parsePublicRouteFromLocation(loc);
  if (route.kind === 'person' && route.legacy) {
    return `${getPublicSiteOrigin(origin)}/tree/${route.treeId}/person/${route.personId}${loc.hash}`;
  }
  if (route.kind === 'tree' && route.legacy) {
    return `${getPublicSiteOrigin(origin)}/tree/${route.treeId}${loc.hash}`;
  }
  return null;
};

export const absolutePublicPath = (
  route: Exclude<PublicRoute, { kind: 'home' }>,
  origin?: string
): string => {
  switch (route.kind) {
    case 'book':
      return buildPublicBookUrl(route.bookId, origin);
    case 'tree':
      return buildTreeUrl(route.treeId, origin);
    case 'person':
      return buildPersonUrl(route.treeId, route.personId, origin);
  }
};
