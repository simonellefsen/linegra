// Roadmap U4 — Schema.org JSON-LD for public person pages.

import type { PublicCrawlRelationshipGroups } from './publicCrawlRelations';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildPersonUrl, buildTreeUrl, getPublicSiteOrigin } from './publicRoutes';

export interface PublicPersonJsonLdInput {
  treeId: string;
  treeName: string;
  person: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    birthPlace?: string | null;
    deathPlace?: string | null;
    bio?: string | null;
  };
  relationships: PublicCrawlRelationshipGroups;
  origin?: string;
}

export const buildPersonJsonLd = (input: PublicPersonJsonLdInput): Record<string, unknown> => {
  const origin = getPublicSiteOrigin(input.origin);
  const name = formatPersonDisplayName(input.person);
  const related = [
    ...input.relationships.parents,
    ...input.relationships.spouses,
    ...input.relationships.children,
    ...input.relationships.siblings,
  ].map((link) => ({
    '@type': 'Person',
    name: link.name,
    url: link.href,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    birthDate: input.person.birthDate || undefined,
    deathDate: input.person.deathDate || undefined,
    birthPlace: input.person.birthPlace || undefined,
    deathPlace: input.person.deathPlace || undefined,
    description: input.person.bio?.slice(0, 500) || undefined,
    url: buildPersonUrl(input.treeId, input.person.id, origin),
    isPartOf: {
      '@type': 'WebSite',
      name: input.treeName,
      url: buildTreeUrl(input.treeId, origin),
    },
    relatedTo: related.length ? related : undefined,
  };
};

export const buildWebsiteJsonLd = (origin?: string): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Linegra Family Archive',
  url: getPublicSiteOrigin(origin),
  description:
    'Interactive genealogy archive with pedigree views, GEDCOM import/export, and AI-assisted research tools.',
});
