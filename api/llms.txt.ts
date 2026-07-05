import { getPublicSiteOrigin } from '../lib/publicRoutes';

export const config = { runtime: 'edge' };

const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export default async function handler(request: Request): Promise<Response> {
  const origin = getPublicSiteOrigin(new URL(request.url).origin);
  const body = `# Linegra — agent-oriented site index (llms.txt)
# ${origin}

> Linegra is a genealogy archive with interactive pedigree views, GEDCOM import/export,
> family books, and AI-assisted research. Public content is read-only; living and private
> persons are excluded from crawl indexes.

## Public URL patterns

- Site home: ${origin}/
- Public tree directory: ${origin}/trees
- Public tree landing: ${origin}/tree/{treeSlug-or-uuid}
- Public person profile: ${origin}/tree/{treeSlug}/person/{name-year-id8}
- Shared family book: ${origin}/book/{bookUuid}

Legacy query URLs (\`?tree=&person=\`) redirect to the canonical paths above.

## Machine-readable alternates

- Sitemap: ${origin}/sitemap.xml
- Tree directory Markdown: ${origin}/api/public/trees?format=md
- Tree directory JSON: ${origin}/api/public/trees?format=json
- Person JSON: ${origin}/api/public/person/{personUuid}
- Person Markdown: ${origin}/api/public/person/{personUuid}?format=md
- Person HTML (crawler shell): ${origin}/api/public/person/{personUuid}?format=html
- Tree index HTML: ${origin}/api/public/tree/{treeUuid}?format=html
- Tree index Markdown: ${origin}/api/public/tree/{treeUuid}?format=md

Send \`Accept: text/markdown\` to public tree/person routes for Markdown shells.

## Privacy rules

- Only \`is_public\` family trees appear in indexes.
- Living persons, private profiles (\`is_private\`), and restricted notes/media are omitted.
- Family books must be explicitly shared (\`is_public\`) and marked complete.

## Contact

Use the in-app administrator flow for tree access requests. Do not scrape authenticated \`/records\` routes.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': CACHE,
    },
  });
}
