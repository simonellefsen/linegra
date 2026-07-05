// Roadmap U1/U4/U5 — server-rendered HTML shells for crawlers and agents.

import type { PublicCrawlRelationshipGroups } from './publicCrawlRelations';
import { buildFamilyJsonLd, buildPersonJsonLd, buildWebsiteJsonLd } from './publicCrawlJsonLd';
import type { PublicFamilyCrawlPayload } from './publicCrawlService';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildPersonUrl, buildTreeUrl, getPublicSiteOrigin } from './publicRoutes';

export interface PublicPersonHtmlInput {
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

export interface PublicTreeHtmlInput {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  description?: string | null;
  persons: { id: string; name: string; birthDate?: string | null; deathDate?: string | null }[];
  origin?: string;
  page?: number;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const renderLinkList = (
  title: string,
  links: { relationshipLabel: string; name: string; href: string; familyPageHref?: string }[]
) => {
  if (!links.length) return '';
  const items = links
    .map((link) => {
      const familyLink = link.familyPageHref
        ? ` · <a href="${escapeHtml(link.familyPageHref)}">family page</a>`
        : '';
      return `<li><a href="${escapeHtml(link.href)}" title="${escapeHtml(`${link.relationshipLabel}: ${link.name}`)}">${escapeHtml(link.name)}</a> <span class="rel">(${escapeHtml(link.relationshipLabel)})</span>${familyLink}</li>`;
    })
    .join('');
  return `<section><h2>${escapeHtml(title)}</h2><ul>${items}</ul></section>`;
};

const renderChildUnionSections = (
  groups: PublicPersonHtmlInput['relationships']['childUnions']
) => {
  if (!groups.length) return '';
  return groups
    .map((group) => {
      const heading = group.familyPageHref
        ? `<h3><a href="${escapeHtml(group.familyPageHref)}">${escapeHtml(group.heading)}</a></h3>`
        : `<h3>${escapeHtml(group.heading)}</h3>`;
      const items = group.children
        .map(
          (link) =>
            `<li><a href="${escapeHtml(link.href)}" title="${escapeHtml(`${link.relationshipLabel}: ${link.name}`)}">${escapeHtml(link.name)}</a> <span class="rel">(${escapeHtml(link.relationshipLabel)})</span></li>`
        )
        .join('');
      return `<section>${heading}<ul>${items}</ul></section>`;
    })
    .join('');
};

export const renderPublicPersonHtml = (input: PublicPersonHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const name = formatPersonDisplayName(input.person);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const canonical = buildPersonUrl(
    treeRef,
    {
      id: input.person.id,
      firstName: input.person.firstName,
      lastName: input.person.lastName,
      birthDate: input.person.birthDate,
    },
    origin
  );
  const treeUrl = buildTreeUrl(treeRef, origin);
  const description =
    input.person.bio?.trim().slice(0, 160) ||
    [input.person.birthDate, input.person.deathDate].filter(Boolean).join(' – ') ||
    `${name} in the ${input.treeName} archive on Linegra.`;
  const jsonLd = buildPersonJsonLd(input);
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Linegra', item: origin },
      { '@type': 'ListItem', position: 2, name: input.treeName, item: treeUrl },
      { '@type': 'ListItem', position: 3, name, item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} · ${escapeHtml(input.treeName)} · Linegra</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(name)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  <style>
    body { font-family: Georgia, serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    .meta { color: #475569; margin-bottom: 1.5rem; }
    .rel { color: #64748b; font-size: 0.9rem; }
    a { color: #1d4ed8; }
    nav.breadcrumb { font-size: 0.9rem; margin-bottom: 1rem; }
    #app-boot { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.85rem; }
  </style>
</head>
<body>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="${escapeHtml(origin)}">Linegra</a> ›
    <a href="${escapeHtml(treeUrl)}">${escapeHtml(input.treeName)}</a> ›
    <span>${escapeHtml(name)}</span>
  </nav>
  <main>
    <h1>${escapeHtml(name)}</h1>
    <p class="meta">
      ${input.person.birthDate ? `Born ${escapeHtml(input.person.birthDate)}${input.person.birthPlace ? ` · ${escapeHtml(String(input.person.birthPlace))}` : ''}` : ''}
      ${input.person.deathDate ? `<br>Died ${escapeHtml(input.person.deathDate)}${input.person.deathPlace ? ` · ${escapeHtml(String(input.person.deathPlace))}` : ''}` : ''}
    </p>
    ${input.person.bio?.trim() ? `<section><h2>Biography</h2><p>${escapeHtml(input.person.bio.trim())}</p></section>` : ''}
    ${renderLinkList('Parents', input.relationships.parents)}
    ${renderLinkList('Spouses & partners', input.relationships.spouses)}
    ${input.relationships.childUnions.length ? renderChildUnionSections(input.relationships.childUnions) : renderLinkList('Children', input.relationships.children)}
    ${renderLinkList('Siblings', input.relationships.siblings)}
  </main>
  <p id="app-boot"><a href="${escapeHtml(canonical)}">Open interactive archive</a> · <a href="${escapeHtml(`${canonical}?format=md`)}">Markdown</a> · <a href="${escapeHtml(`${origin}/api/public/person/${input.person.id}`)}">JSON</a></p>
</body>
</html>`;
};

export interface PublicFamilyHtmlInput {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  union: PublicFamilyCrawlPayload['union'];
  spouses: PublicFamilyCrawlPayload['spouses'];
  children: PublicFamilyCrawlPayload['children'];
  origin?: string;
}

export const renderPublicFamilyHtml = (input: PublicFamilyHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const canonical = input.union.familyPageHref;
  const treeUrl = buildTreeUrl(treeRef, origin);
  const spouseNames = input.spouses.map((spouse) => spouse.name).join(' and ');
  const unionLabel = input.union.type === 'partner' ? 'Partnership' : 'Marriage';
  const unionFacts = [input.union.date, input.union.place].filter(Boolean).join(', ');
  const description = unionFacts
    ? `${unionLabel} of ${spouseNames} (${unionFacts}) in ${input.treeName}.`
    : `Family of ${spouseNames} in ${input.treeName}.`;
  const jsonLd = buildFamilyJsonLd(input);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(spouseNames)} · ${escapeHtml(input.treeName)} · Linegra</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: Georgia, serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    .meta { color: #475569; margin-bottom: 1.5rem; }
    .rel { color: #64748b; font-size: 0.9rem; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <nav aria-label="Breadcrumb">
    <a href="${escapeHtml(origin)}">Linegra</a> ›
    <a href="${escapeHtml(treeUrl)}">${escapeHtml(input.treeName)}</a> ›
    <span>${escapeHtml(spouseNames)}</span>
  </nav>
  <main>
    <h1>${escapeHtml(spouseNames)}</h1>
    <p class="meta">${escapeHtml(unionLabel)}${unionFacts ? ` · ${escapeHtml(unionFacts)}` : ''}</p>
    <section><h2>Spouses</h2><ul>${input.spouses
      .map(
        (spouse) =>
          `<li><a href="${escapeHtml(spouse.href)}">${escapeHtml(spouse.name)}</a></li>`
      )
      .join('')}</ul></section>
    ${renderLinkList('Children', input.children)}
  </main>
  <p><a href="${escapeHtml(canonical)}">Open interactive archive</a> · <a href="${escapeHtml(`${origin}/api/public/family/${input.union.id}?format=md`)}">Markdown</a> · <a href="${escapeHtml(`${origin}/api/public/family/${input.union.id}`)}">JSON</a></p>
</body>
</html>`;
};

export const renderPublicTreeHtml = (input: PublicTreeHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const page = Math.max(1, input.page ?? 1);
  const pageSize = 500;
  const canonical = buildTreeUrl(treeRef, origin);
  const pageUrl = (targetPage: number) => {
    const url = new URL(canonical);
    if (targetPage > 1) url.searchParams.set('page', String(targetPage));
    return url.toString();
  };
  const hasNextPage = input.persons.length >= pageSize;
  const description =
    input.description?.trim() ||
    `Public family tree index for ${input.treeName} on Linegra.`;
  const rows = input.persons
    .map((person) => {
      const href = buildPersonUrl(
        treeRef,
        {
          id: person.id,
          firstName: person.name.split(' ')[0],
          lastName: person.name.split(' ').slice(1).join(' '),
          birthDate: person.birthDate,
        },
        origin
      );
      const dates = [person.birthDate, person.deathDate].filter(Boolean).join(' – ');
      return `<li><a href="${escapeHtml(href)}" title="${escapeHtml(person.name)}">${escapeHtml(person.name)}</a>${dates ? ` <span class="rel">(${escapeHtml(dates)})</span>` : ''}</li>`;
    })
    .join('');
  const jsonLd = buildWebsiteJsonLd(origin);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.treeName)} · Linegra</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(page > 1 ? pageUrl(page) : canonical)}">
  ${page > 1 ? `<link rel="prev" href="${escapeHtml(pageUrl(page - 1))}">` : ''}
  ${hasNextPage ? `<link rel="next" href="${escapeHtml(pageUrl(page + 1))}">` : ''}
  <link rel="alternate" type="text/markdown" href="${escapeHtml(`${pageUrl(page)}?format=md`)}">
  <meta property="og:title" content="${escapeHtml(input.treeName)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: Georgia, serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; color: #0f172a; line-height: 1.6; }
    h1 { font-size: 2rem; }
    .rel { color: #64748b; font-size: 0.9rem; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(input.treeName)}</h1>
    <p>${escapeHtml(description)}</p>
    <section>
      <h2>People in this tree${page > 1 ? ` (page ${page})` : ''}</h2>
      <ul>${rows}</ul>
    </section>
    <p>
      <a href="${escapeHtml(canonical)}">Open interactive archive</a>
      · <a href="${escapeHtml(`${pageUrl(page)}?format=md`)}">Markdown</a>
      · <a href="${escapeHtml(`${pageUrl(page)}?format=json`)}">JSON</a>
    </p>
    ${hasNextPage ? `<p><a rel="next" href="${escapeHtml(pageUrl(page + 1))}">Next page</a></p>` : ''}
    ${page > 1 ? `<p><a rel="prev" href="${escapeHtml(pageUrl(page - 1))}">Previous page</a></p>` : ''}
  </main>
</body>
</html>`;
};

export const renderPublicTreeMarkdown = (input: PublicTreeHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const page = Math.max(1, input.page ?? 1);
  const canonical = buildTreeUrl(treeRef, origin);
  const lines = [
    `# ${input.treeName}`,
    '',
    input.description?.trim() || `Public family tree index for ${input.treeName} on Linegra.`,
    '',
    `Canonical: ${canonical}${page > 1 ? `?page=${page}` : ''}`,
    '',
    '## People',
    '',
  ];
  input.persons.forEach((person) => {
    const href = buildPersonUrl(
      treeRef,
      {
        id: person.id,
        firstName: person.name.split(' ')[0],
        lastName: person.name.split(' ').slice(1).join(' '),
        birthDate: person.birthDate,
      },
      origin
    );
    const dates = [person.birthDate, person.deathDate].filter(Boolean).join(' – ');
    lines.push(`- [${person.name}](${href})${dates ? ` (${dates})` : ''}`);
  });
  if (input.persons.length >= 500) {
    lines.push('', `[Next page](${canonical}?page=${page + 1}&format=md)`);
  }
  if (page > 1) {
    lines.push('', `[Previous page](${canonical}?page=${page - 1}&format=md)`);
  }
  return lines.join('\n');
};

export const renderPublicTreesDirectoryHtml = (input: {
  trees: Array<{
    treeId: string;
    name: string;
    slug: string | null;
    description: string | null;
    personCount: number;
  }>;
  origin?: string;
}): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const canonical = `${origin}/trees`;
  const rows = input.trees
    .map((tree) => {
      const href = buildTreeUrl({ id: tree.treeId, slug: tree.slug }, origin);
      const blurb = tree.description?.trim() || `${tree.personCount} publicly indexed persons`;
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(tree.name)}</a> <span class="rel">(${escapeHtml(blurb)})</span></li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Public family trees · Linegra</title>
  <meta name="description" content="Directory of public genealogy archives on Linegra.">
  <link rel="canonical" href="${escapeHtml(canonical)}">
</head>
<body>
  <main>
    <h1>Public family trees</h1>
    <ul>${rows}</ul>
    <p><a href="${escapeHtml(origin)}">Linegra home</a> · <a href="${escapeHtml(`${origin}/sitemap.xml`)}">Sitemap</a></p>
  </main>
</body>
</html>`;
};
