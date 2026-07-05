// Roadmap U2/U16 — stable public URL scheme (UUID compat + semantic slugs).

import { parseBookRouteFromLocation } from './bookShare';
import {
  buildBookSlugSegment,
  buildPersonSlugSegment,
  isPublicUuid,
  parsePersonIdPrefix,
  type PersonSlugInput,
} from './publicSlugs';

export { isPublicUuid };

export interface PublicTreeRef {
  id: string;
  slug?: string | null;
}

export type PublicRoute =
  | { kind: 'home' }
  | { kind: 'trees-directory' }
  | { kind: 'book'; bookId: string; bookSlug?: string }
  | { kind: 'tree'; treeId?: string; treeSlug?: string; legacy?: boolean }
  | { kind: 'tree-people'; treeId?: string; treeSlug?: string; page: number }
  | { kind: 'tree-surnames'; treeId?: string; treeSlug?: string }
  | { kind: 'tree-surname'; treeId?: string; treeSlug?: string; surname: string }
  | { kind: 'family'; treeId?: string; treeSlug?: string; unionIdPrefix: string }
  | {
      kind: 'person';
      treeId?: string;
      personId?: string;
      treeSlug?: string;
      personSlug?: string;
      personIdPrefix?: string;
      legacy?: boolean;
    };

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

const treeSegment = (tree: string | PublicTreeRef): { id?: string; slug?: string } => {
  if (typeof tree === 'string') {
    return isPublicUuid(tree) ? { id: tree } : { slug: tree };
  }
  return { id: tree.id, slug: tree.slug ?? undefined };
};

export const buildTreesDirectoryUrl = (origin?: string): string =>
  `${getPublicSiteOrigin(origin)}/trees`;

export const buildTreeUrl = (tree: string | PublicTreeRef, origin?: string): string => {
  const { id, slug } = treeSegment(tree);
  const base = getPublicSiteOrigin(origin);
  if (slug) return `${base}/tree/${slug}`;
  return `${base}/tree/${id}`;
};

export const buildTreePeopleUrl = (
  tree: string | PublicTreeRef,
  page = 1,
  origin?: string
): string => {
  const url = new URL(buildTreeUrl(tree, origin));
  url.pathname = `${url.pathname.replace(/\/$/, '')}/people`;
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
};

export const buildPersonUrl = (
  tree: string | PublicTreeRef,
  person: string | (PersonSlugInput & { id: string }),
  origin?: string
): string => {
  const { id: treeId, slug: treeSlug } = treeSegment(tree);
  const base = getPublicSiteOrigin(origin);
  const treePath = treeSlug ?? treeId;
  if (typeof person === 'object' && treeSlug) {
    return `${base}/tree/${treePath}/person/${buildPersonSlugSegment(person)}`;
  }
  const personId = typeof person === 'string' ? person : person.id;
  return `${base}/tree/${treePath}/person/${personId}`;
};

export const buildPublicBookUrl = (
  book: string | { id: string; title?: string | null; slug?: string | null },
  origin?: string
): string => {
  const base = getPublicSiteOrigin(origin);
  if (typeof book === 'string') return `${base}/book/${book}`;
  if (book.slug) return `${base}/book/${book.slug}`;
  if (book.title) return `${base}/book/${buildBookSlugSegment(book.title, book.id)}`;
  return `${base}/book/${book.id}`;
};

const parseTreeSegmentRoute = (
  treeSegmentValue: string,
  restPath: string,
  search: string
): PublicRoute | null => {
  const treeRef = isPublicUuid(treeSegmentValue)
    ? { treeId: treeSegmentValue }
    : { treeSlug: treeSegmentValue };

  if (!restPath) {
    return { kind: 'tree', ...treeRef };
  }

  if (restPath === 'people') {
    const page = Math.max(1, Number(new URLSearchParams(search).get('page') ?? '1') || 1);
    return { kind: 'tree-people', ...treeRef, page };
  }

  if (restPath === 'surnames') {
    return { kind: 'tree-surnames', ...treeRef };
  }

  const surnameMatch = restPath.match(/^surnames\/([^/]+)\/?$/i);
  if (surnameMatch?.[1]) {
    return { kind: 'tree-surname', ...treeRef, surname: decodeURIComponent(surnameMatch[1]) };
  }

  const familyMatch = restPath.match(/^family\/([^/]+)\/?$/i);
  if (familyMatch?.[1]) {
    return { kind: 'family', ...treeRef, unionIdPrefix: familyMatch[1].toLowerCase() };
  }

  const personMatch = restPath.match(/^person\/([^/]+)\/?$/i);
  if (personMatch?.[1]) {
    const personSegment = personMatch[1];
    if (isPublicUuid(personSegment)) {
      return { kind: 'person', ...treeRef, personId: personSegment };
    }
    const idPrefix = parsePersonIdPrefix(personSegment);
    return { kind: 'person', ...treeRef, personSlug: personSegment, personIdPrefix: idPrefix ?? undefined };
  }

  return null;
};

/** Parse public paths (v1 UUID + v2 slug routes) and legacy query URLs. */
export const parsePublicRouteFromLocation = (
  loc: Pick<Location, 'pathname' | 'search'> = typeof window !== 'undefined'
    ? window.location
    : { pathname: '/', search: '' }
): PublicRoute => {
  if (loc.pathname === '/trees' || loc.pathname === '/trees/') {
    return { kind: 'trees-directory' };
  }

  const bookId = parseBookRouteFromLocation(loc);
  if (bookId) {
    if (isPublicUuid(bookId)) return { kind: 'book', bookId };
    return { kind: 'book', bookId, bookSlug: bookId };
  }

  const treePathMatch = loc.pathname.match(/^\/tree\/([^/]+)\/?(.*)$/i);
  if (treePathMatch?.[1]) {
    const parsed = parseTreeSegmentRoute(treePathMatch[1], treePathMatch[2] ?? '', loc.search);
    if (parsed) return parsed;
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
  if (route.kind === 'person' && route.legacy && route.treeId && route.personId) {
    return `${buildPersonUrl(route.treeId, route.personId, origin)}${loc.hash}`;
  }
  if (route.kind === 'tree' && route.legacy && route.treeId) {
    return `${buildTreeUrl(route.treeId, origin)}${loc.hash}`;
  }
  return null;
};

export const absolutePublicPath = (
  route: Exclude<PublicRoute, { kind: 'home' }>,
  origin?: string
): string => {
  switch (route.kind) {
    case 'trees-directory':
      return buildTreesDirectoryUrl(origin);
    case 'book':
      return buildPublicBookUrl(route.bookSlug ?? route.bookId, origin);
    case 'tree':
      return buildTreeUrl(route.treeSlug ?? route.treeId ?? '', origin);
    case 'tree-people':
      return buildTreePeopleUrl(route.treeSlug ?? route.treeId ?? '', route.page, origin);
    case 'tree-surnames':
      return `${buildTreeUrl(route.treeSlug ?? route.treeId ?? '', origin)}/surnames`;
    case 'tree-surname':
      return `${buildTreeUrl(route.treeSlug ?? route.treeId ?? '', origin)}/surnames/${encodeURIComponent(route.surname)}`;
    case 'family':
      return `${buildTreeUrl(route.treeSlug ?? route.treeId ?? '', origin)}/family/${route.unionIdPrefix}`;
    case 'person':
      return buildPersonUrl(
        route.treeSlug ?? route.treeId ?? '',
        route.personSlug ?? route.personId ?? '',
        origin
      );
  }
};
