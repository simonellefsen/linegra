// Roadmap U — server-rendered family-book shells for crawlers and agents.

import type { BookChapter, BookLanguage, BookStatistics } from '../types';
import { bookStrings, DEFAULT_BOOK_LANGUAGE } from './bookI18n';
import { renderPublicCrawlRobotsMeta } from './crawlMetaPolicy';
import { buildPublicBookUrl, buildTreeUrl, getPublicSiteOrigin } from './publicRoutes';
import { resolvePublicBookId } from './publicRouteResolve';
import { createServerSupabase } from './supabaseServer';

export interface PublicBookCrawlPayload {
  bookId: string;
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  title: string;
  subtitle?: string | null;
  chapters: BookChapter[];
  statistics: BookStatistics;
  language: BookLanguage;
  createdAt: string;
  updatedAt?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const mapBookRow = (row: Record<string, unknown>): Omit<PublicBookCrawlPayload, 'treeName' | 'treeSlug'> => ({
  bookId: String(row.id),
  treeId: String(row.tree_id),
  title: String(row.title ?? 'Family book'),
  subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
  chapters: Array.isArray(row.chapters) ? (row.chapters as BookChapter[]) : [],
  statistics: (row.statistics as BookStatistics) ?? {
    personCount: 0,
    topSurnames: [],
    topPlaces: [],
    topOccupations: [],
  },
  language:
    ((row.options as { language?: BookLanguage } | null)?.language as BookLanguage) ??
    DEFAULT_BOOK_LANGUAGE,
  createdAt: String(row.created_at ?? new Date().toISOString()),
  updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
});

export const loadPublicBookCrawlPayload = async (
  bookSegment: string
): Promise<PublicBookCrawlPayload | null> => {
  const bookId = await resolvePublicBookId(bookSegment);
  if (!bookId) return null;

  const supabase = createServerSupabase();
  const { data: bookRow, error: bookError } = await supabase
    .from('family_books')
    .select('id, tree_id, title, subtitle, chapters, statistics, options, created_at, updated_at')
    .eq('id', bookId)
    .eq('is_public', true)
    .eq('status', 'complete')
    .maybeSingle();
  if (bookError || !bookRow) return null;

  const { data: treeRow, error: treeError } = await supabase
    .from('family_trees')
    .select('id, name, slug, is_public')
    .eq('id', bookRow.tree_id)
    .eq('is_public', true)
    .maybeSingle();
  if (treeError || !treeRow) return null;

  const mapped = mapBookRow(bookRow as Record<string, unknown>);
  return {
    ...mapped,
    treeName: String(treeRow.name ?? 'Family tree'),
    treeSlug: typeof treeRow.slug === 'string' ? treeRow.slug : null,
  };
};

const formatCreatedDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
};

export const buildBookJsonLd = (
  input: PublicBookCrawlPayload & { origin?: string }
): Record<string, unknown> => {
  const origin = getPublicSiteOrigin(input.origin);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const canonical = buildPublicBookUrl(input.bookId, origin);
  const overview = input.chapters.find((chapter) => chapter.kind === 'overview');

  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: input.title,
    ...(input.subtitle ? { alternateName: input.subtitle } : {}),
    url: canonical,
    datePublished: input.createdAt.slice(0, 10),
    ...(overview?.narrative ? { description: overview.narrative.slice(0, 500) } : {}),
    inLanguage: input.language,
    isPartOf: {
      '@type': 'WebSite',
      name: input.treeName,
      url: buildTreeUrl(treeRef, origin),
    },
    hasPart: input.chapters
      .filter((chapter) => chapter.kind !== 'section')
      .map((chapter) => ({
        '@type': 'Chapter',
        name: chapter.title,
        ...(chapter.narrative ? { text: chapter.narrative.slice(0, 1000) } : {}),
      })),
  };
};

export const renderPublicBookHtml = (input: PublicBookCrawlPayload & { origin?: string }): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const strings = bookStrings(input.language);
  const treeRef = { id: input.treeId, slug: input.treeSlug };
  const canonical = buildPublicBookUrl(input.bookId, origin);
  const treeUrl = buildTreeUrl(treeRef, origin);
  const description =
    input.subtitle?.trim() ||
    input.chapters.find((chapter) => chapter.kind === 'overview')?.narrative?.slice(0, 280)?.trim() ||
    `Shared family history book for ${input.treeName} on Linegra.`;
  const jsonLd = buildBookJsonLd({ ...input, origin });
  const hasSections = input.chapters.some((chapter) => chapter.kind === 'section');

  const toc = input.chapters
    .map((chapter) => {
      if (chapter.kind === 'section') {
        return `<li class="section">${escapeHtml(chapter.title)}</li>`;
      }
      const lifespan =
        chapter.kind === 'person' && chapter.facts?.lifespanLabel
          ? ` <span class="rel">(${escapeHtml(chapter.facts.lifespanLabel)})</span>`
          : '';
      const indent = hasSections && chapter.kind !== 'overview' ? ' class="indent"' : '';
      return `<li${indent}>${escapeHtml(chapter.title)}${lifespan}</li>`;
    })
    .join('');

  const body = input.chapters
    .map((chapter, index) => {
      if (chapter.kind === 'section') {
        const blurb = chapter.narrative
          ? `<p class="section-blurb">${escapeHtml(chapter.narrative)}</p>`
          : '';
        return `<section class="section-break"><h2>${escapeHtml(chapter.title)}</h2>${blurb}</section>`;
      }
      const factBits = [chapter.facts?.lifespanLabel, chapter.facts?.birthPlace].filter(Boolean) as string[];
      const meta =
        chapter.kind === 'person' && factBits.length
          ? `<p class="rel">${escapeHtml(factBits.join(' · '))}</p>`
          : '';
      const narrative = chapter.narrative
        ? `<div class="narrative">${escapeHtml(chapter.narrative)}</div>`
        : '';
      const headingTag = chapter.kind === 'overview' ? 'h2' : 'h2';
      return `<section id="chapter-${index}"><${headingTag}>${escapeHtml(chapter.title)}</${headingTag}>${meta}${narrative}</section>`;
    })
    .join('');

  const spanYears =
    input.statistics.earliestBirthYear != null && input.statistics.latestDeathYear != null
      ? `${input.statistics.earliestBirthYear}–${input.statistics.latestDeathYear}`
      : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(input.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${renderPublicCrawlRobotsMeta()}
  <title>${escapeHtml(input.title)} · Linegra</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" type="text/markdown" href="${escapeHtml(`${origin}/api/public/book/${input.bookId}?format=md`)}">
  <meta property="og:title" content="${escapeHtml(input.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="book">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: Georgia, serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #0f172a; line-height: 1.65; }
    h1 { font-size: 2.25rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; }
    .rel { color: #64748b; font-size: 0.95rem; }
    .cover { text-align: center; padding: 3rem 0 2rem; border-bottom: 1px solid #e2e8f0; margin-bottom: 2rem; }
    .cover .label { letter-spacing: 0.35em; text-transform: uppercase; font-size: 0.7rem; color: #94a3b8; }
    .subtitle { font-style: italic; color: #475569; margin-top: 0.75rem; }
    .stats { margin-top: 1.5rem; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.2em; }
    .narrative { white-space: pre-wrap; margin-top: 1rem; }
    .section-break { text-align: center; padding: 2rem 0; }
    .section-blurb { font-style: italic; color: #64748b; }
    ul.toc { list-style: decimal; padding-left: 1.5rem; }
    ul.toc li.section { list-style: none; margin-top: 1rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; }
    ul.toc li.indent { margin-left: 1rem; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <header class="cover">
    <p class="label">${escapeHtml(strings.coverLabel)}</p>
    <h1>${escapeHtml(input.title)}</h1>
    ${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ''}
    <p class="stats">${escapeHtml(strings.lives(input.statistics.personCount))}${spanYears ? ` · ${escapeHtml(spanYears)}` : ''}</p>
    <p class="rel">${escapeHtml(formatCreatedDate(input.createdAt))}</p>
  </header>
  <main>
    <section>
      <h2>${escapeHtml(strings.contents)}</h2>
      <ol class="toc">${toc}</ol>
    </section>
    ${body}
  </main>
  <footer class="rel">
    <p>${escapeHtml(strings.generatedBy)} · <a href="${escapeHtml(treeUrl)}">${escapeHtml(input.treeName)}</a></p>
    <p><a href="${escapeHtml(canonical)}">Open interactive book</a> · <a href="${escapeHtml(`${origin}/api/public/book/${input.bookId}?format=md`)}">Markdown</a> · <a href="${escapeHtml(`${origin}/api/public/book/${input.bookId}`)}">JSON</a></p>
  </footer>
</body>
</html>`;
};

export const renderPublicBookMarkdown = (
  input: PublicBookCrawlPayload & { origin?: string }
): string => {
  const origin = getPublicSiteOrigin(input.origin);
  const strings = bookStrings(input.language);
  const canonical = buildPublicBookUrl(input.bookId, origin);
  const treeUrl = buildTreeUrl({ id: input.treeId, slug: input.treeSlug }, origin);

  const toc = input.chapters
    .map((chapter) => {
      const suffix =
        chapter.kind === 'person' && chapter.facts?.lifespanLabel
          ? ` (${chapter.facts.lifespanLabel})`
          : '';
      return `- ${chapter.title}${suffix}`;
    })
    .join('\n');

  const chapters = input.chapters
    .map((chapter) => {
      const meta =
        chapter.kind === 'person' && chapter.facts?.lifespanLabel
          ? `\n*${chapter.facts.lifespanLabel}${chapter.facts.birthPlace ? ` · ${chapter.facts.birthPlace}` : ''}*\n`
          : '\n';
      const body = chapter.narrative?.trim() ? `${meta}\n${chapter.narrative.trim()}\n` : meta;
      return `## ${chapter.title}\n${body}`;
    })
    .join('\n\n');

  return `# ${input.title}

${input.subtitle ? `*${input.subtitle}*\n\n` : ''}${strings.lives(input.statistics.personCount)} · [${input.treeName}](${treeUrl})

## ${strings.contents}

${toc}

${chapters}

---

${strings.generatedBy} · ${formatCreatedDate(input.createdAt)}

[Interactive book](${canonical}) · [JSON](${origin}/api/public/book/${input.bookId}) · [HTML](${origin}/api/public/book/${input.bookId}?format=html)
`;
};
