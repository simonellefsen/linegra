// U18f — resolve crawl telemetry resource ids to admin-friendly labels + public URLs.

import {
  buildFamilyUrl,
  buildPersonUrl,
  buildPublicBookUrl,
  buildTreeUrl,
  getPublicSiteOrigin,
} from './publicRoutes';
import { isPublicUuid } from './publicSlugs';
import type { CrawlTrafficStats } from './crawlTrafficStats';

export type CrawlTrafficResourceKind = 'person' | 'tree' | 'book' | 'family' | 'slug' | 'unknown';

export interface CrawlTrafficHitRef {
  route: string;
  resourceId?: string | null;
  resourceKey?: string | null;
}

export interface CrawlTrafficResourceLabel {
  kind: CrawlTrafficResourceKind;
  label: string;
  href?: string;
  raw?: string;
}

export const crawlTrafficResourceCacheKey = (hit: CrawlTrafficHitRef): string =>
  `${hit.route}:${hit.resourceId ?? hit.resourceKey ?? ''}`;

export const humanizeCrawlResourceKey = (resourceKey: string): string => {
  const withoutId8 = resourceKey.replace(/-[a-f0-9]{8}$/i, '');
  const words = withoutId8.replace(/-/g, ' ').trim();
  return words ? words.replace(/\b\w/g, (char) => char.toUpperCase()) : resourceKey;
};

export const buildSlugResourceHref = (
  route: string,
  resourceKey: string,
  origin = getPublicSiteOrigin()
): string | undefined => {
  const base = origin.replace(/\/$/, '');
  if (route === 'tree') return `${base}/tree/${resourceKey}`;
  if (route === 'book') return `${base}/book/${resourceKey}`;
  if (route === 'person') {
    const treeSegment = resourceKey.includes('/') ? resourceKey.split('/')[0] : null;
    const personSegment = resourceKey.includes('/') ? resourceKey.split('/').slice(1).join('/') : resourceKey;
    if (treeSegment && personSegment) return `${base}/tree/${treeSegment}/person/${personSegment}`;
    return undefined;
  }
  if (route === 'family') {
    const treeSegment = resourceKey.includes('/') ? resourceKey.split('/')[0] : null;
    const unionSegment = resourceKey.includes('/') ? resourceKey.split('/').slice(1).join('/') : resourceKey;
    if (treeSegment && unionSegment) return `${base}/tree/${treeSegment}/family/${unionSegment}`;
    return undefined;
  }
  return undefined;
};

export const labelCrawlResourceFromKey = (
  route: string,
  resourceKey: string,
  origin?: string
): CrawlTrafficResourceLabel => ({
  kind: 'slug',
  label: `${humanizeCrawlResourceKey(resourceKey)} (${route})`,
  href: buildSlugResourceHref(route, resourceKey, origin),
  raw: resourceKey,
});

export const collectCrawlTrafficResourceRefs = (stats: CrawlTrafficStats): CrawlTrafficHitRef[] => {
  const seen = new Set<string>();
  const refs: CrawlTrafficHitRef[] = [];

  const add = (route: string, resourceId?: string | null, resourceKey?: string | null) => {
    if (!resourceId && !resourceKey) return;
    const hit = { route, resourceId, resourceKey };
    const key = crawlTrafficResourceCacheKey(hit);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(hit);
  };

  stats.bot.recent.forEach((row) => add(row.route, row.resourceId, row.resourceKey));
  stats.visitor.recent.forEach((row) => add(row.route, row.resourceId, row.resourceKey));
  return refs;
};

const buildPersonLabel = (first?: string | null, last?: string | null): string => {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || 'Unknown person';
};

export interface ResolveCrawlTrafficResourceContext {
  origin?: string;
  persons: Map<
    string,
    { treeId: string; firstName?: string | null; lastName?: string | null; birthDate?: string | null }
  >;
  trees: Map<string, { name: string; slug?: string | null }>;
  books: Map<string, { title: string; slug?: string | null }>;
  families: Map<string, { treeId: string; spouseNames: string[] }>;
}

export const resolveCrawlTrafficResourceLabels = (
  refs: CrawlTrafficHitRef[],
  context: ResolveCrawlTrafficResourceContext
): Record<string, CrawlTrafficResourceLabel> => {
  const origin = getPublicSiteOrigin(context.origin);
  const labels: Record<string, CrawlTrafficResourceLabel> = {};

  refs.forEach((hit) => {
    const key = crawlTrafficResourceCacheKey(hit);
    const resourceId = hit.resourceId?.trim();
    const resourceKey = hit.resourceKey?.trim();

    if (resourceId && isPublicUuid(resourceId)) {
      if (hit.route === 'person') {
        const person = context.persons.get(resourceId);
        if (person) {
          const tree = context.trees.get(person.treeId);
          const treeRef = tree?.slug ? { id: person.treeId, slug: tree.slug } : person.treeId;
          labels[key] = {
            kind: 'person',
            label: `${buildPersonLabel(person.firstName, person.lastName)} (person)`,
            href: buildPersonUrl(
              treeRef,
              { id: resourceId, firstName: person.firstName, lastName: person.lastName, birthDate: person.birthDate },
              origin
            ),
            raw: resourceId,
          };
          return;
        }
      }

      if (hit.route === 'tree') {
        const tree = context.trees.get(resourceId);
        if (tree) {
          const treeRef = tree.slug ? { id: resourceId, slug: tree.slug } : resourceId;
          labels[key] = {
            kind: 'tree',
            label: `${tree.name} (tree)`,
            href: buildTreeUrl(treeRef, origin),
            raw: resourceId,
          };
          return;
        }
      }

      if (hit.route === 'book') {
        const book = context.books.get(resourceId);
        if (book) {
          labels[key] = {
            kind: 'book',
            label: `${book.title || 'Family book'} (book)`,
            href: buildPublicBookUrl({ id: resourceId, title: book.title, slug: book.slug }, origin),
            raw: resourceId,
          };
          return;
        }
      }

      if (hit.route === 'family') {
        const family = context.families.get(resourceId);
        if (family) {
          const tree = context.trees.get(family.treeId);
          const treeRef = tree?.slug ? { id: family.treeId, slug: tree.slug } : family.treeId;
          const couple =
            family.spouseNames.length >= 2
              ? `${family.spouseNames[0]} & ${family.spouseNames[1]}`
              : family.spouseNames[0] || 'Union';
          labels[key] = {
            kind: 'family',
            label: `${couple} (family)`,
            href: buildFamilyUrl(treeRef, resourceId, origin),
            raw: resourceId,
          };
          return;
        }
      }
    }

    if (resourceKey) {
      labels[key] = labelCrawlResourceFromKey(hit.route, resourceKey, origin);
      return;
    }

    if (resourceId) {
      labels[key] = {
        kind: 'unknown',
        label: resourceId,
        raw: resourceId,
      };
    }
  });

  return labels;
};
