// Roadmap U1/U4/U5 — server-rendered HTML shells for crawlers and agents.

import type { PublicCrawlRelationshipGroups } from './publicCrawlRelations';
import { buildPersonJsonLd, buildWebsiteJsonLd } from './publicCrawlJsonLd';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildPersonUrl, buildTreeUrl, getPublicSiteOrigin } from './publicRoutes';

export interface PublicPersonHtmlInput {
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

export interface PublicTreeHtmlInput {
  treeId: string;
  treeName: string;
  description?: string | null;
  persons: { id: string; name: string; birthDate?: string | null; deathDate?: string | null }[];
  origin?: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const renderLinkList = (
  title: string,
  links: { relationshipLabel: string; name: string; href: string }[]
) => {
  if (!links.length) return '';
  const items = links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.href)}" title="${escapeHtml(`${link.relationshipLabel}: ${link.name}`)}">${escapeHtml(link.name)}</a> <span class="rel">(${escapeHtml(link.relationshipLabel)})</span></li>`
    )
    .join('');
  return `<section><h2>${escapeHtml(title)}</h2><ul>${items}</ul></section>`;
};

export const renderPublicPersonHtml = (input: PublicPersonHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const name = formatPersonDisplayName(input.person);
  const canonical = buildPersonUrl(input.treeId, input.person.id, origin);
  const treeUrl = buildTreeUrl(input.treeId, origin);
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
    ${renderLinkList('Children', input.relationships.children)}
    ${renderLinkList('Siblings', input.relationships.siblings)}
  </main>
  <p id="app-boot"><a href="${escapeHtml(canonical)}">Open interactive archive</a> · <a href="${escapeHtml(`${canonical}?format=md`)}">Markdown</a> · <a href="${escapeHtml(`${origin}/api/public/person/${input.person.id}`)}">JSON</a></p>
</body>
</html>`;
};

export const renderPublicTreeHtml = (input: PublicTreeHtmlInput): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const canonical = buildTreeUrl(input.treeId, origin);
  const description =
    input.description?.trim() ||
    `Public family tree index for ${input.treeName} on Linegra.`;
  const rows = input.persons
    .map((person) => {
      const href = buildPersonUrl(input.treeId, person.id, origin);
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
  <link rel="canonical" href="${escapeHtml(canonical)}">
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
      <h2>People in this tree</h2>
      <ul>${rows}</ul>
    </section>
    <p><a href="${escapeHtml(canonical)}">Open interactive archive</a></p>
  </main>
</body>
</html>`;
};
