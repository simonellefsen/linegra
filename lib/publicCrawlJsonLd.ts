// Roadmap U4 / U17b — Schema.org JSON-LD for public person pages.

import type { PublicCrawlRelationshipGroups } from './publicCrawlRelations';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildPersonUrl, buildTreeUrl, getPublicSiteOrigin } from './publicRoutes';

export interface PublicPersonJsonLdInput {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
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

const toSchemaPerson = (
  treeRef: { id: string; slug?: string | null },
  link: { name: string; href: string },
  origin: string
) => ({
  '@type': 'Person',
  name: link.name,
  url: link.href.startsWith('http') ? link.href : `${origin}${link.href}`,
});

export const buildPersonJsonLd = (input: PublicPersonJsonLdInput): Record<string, unknown> => {
  const origin = getPublicSiteOrigin(input.origin);
  const name = formatPersonDisplayName(input.person);
  const treeRef = { id: input.treeId, slug: input.treeSlug };

  const parents = input.relationships.parents.map((link) => toSchemaPerson(treeRef, link, origin));
  const children = input.relationships.children.map((link) => toSchemaPerson(treeRef, link, origin));
  const spouses = input.relationships.spouses.map((link) => toSchemaPerson(treeRef, link, origin));
  const siblings = input.relationships.siblings.map((link) => toSchemaPerson(treeRef, link, origin));

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    birthDate: input.person.birthDate || undefined,
    deathDate: input.person.deathDate || undefined,
    birthPlace: input.person.birthPlace || undefined,
    deathPlace: input.person.deathPlace || undefined,
    description: input.person.bio?.slice(0, 500) || undefined,
    url: buildPersonUrl(
      treeRef,
      {
        id: input.person.id,
        firstName: input.person.firstName,
        lastName: input.person.lastName,
        birthDate: input.person.birthDate,
      },
      origin
    ),
    isPartOf: {
      '@type': 'WebSite',
      name: input.treeName,
      url: buildTreeUrl(treeRef, origin),
    },
    parent: parents.length === 1 ? parents[0] : parents.length ? parents : undefined,
    children: children.length === 1 ? children[0] : children.length ? children : undefined,
    spouse: spouses.length === 1 ? spouses[0] : spouses.length ? spouses : undefined,
    sibling: siblings.length === 1 ? siblings[0] : siblings.length ? siblings : undefined,
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
