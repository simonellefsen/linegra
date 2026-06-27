import React from 'react';
import { FamilyBook } from '../../types';
import { bookStrings, DEFAULT_BOOK_LANGUAGE } from '../../lib/bookI18n';
import { groundingSummary } from '../../lib/bookComposer';

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Print-optimized family-book layout: cover, table of contents, an overview chapter, then one
 * section per person. Styled for screen preview with Tailwind; the `.book-page-break` class drives
 * page breaks under `@media print` (see index.css). Plain prose is preserved verbatim via
 * `whitespace-pre-wrap` so AI paragraphs render with their own line breaks. Chrome (cover label,
 * "Contents", "N lives", footer) is localized from the book's `options.language`.
 */
const BookDocument: React.FC<{ book: FamilyBook }> = ({ book }) => {
  const strings = bookStrings(book.options.language ?? DEFAULT_BOOK_LANGUAGE);
  const hasSections = book.chapters.some((c) => c.kind === 'section');

  return (
    <div className="mx-auto max-w-[820px] bg-white text-slate-900">
      {/* Cover */}
      <section className="flex min-h-[85vh] flex-col items-center justify-center px-12 py-24 text-center">
        <p className="mb-10 text-[11px] font-bold uppercase tracking-[0.4em] text-slate-400">
          {strings.coverLabel}
        </p>
        <h1 className="font-serif text-5xl font-bold leading-tight text-slate-900">{book.title}</h1>
        {book.subtitle ? <p className="mt-6 font-serif text-lg italic text-slate-600">{book.subtitle}</p> : null}
        <div className="mt-16 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
          <span>{strings.lives(book.statistics.personCount)}</span>
          {book.statistics.earliestBirthYear != null && book.statistics.latestDeathYear != null ? (
            <>
              <span className="text-slate-300">•</span>
              <span>{book.statistics.earliestBirthYear}–{book.statistics.latestDeathYear}</span>
            </>
          ) : null}
        </div>
        <p className="mt-8 text-sm text-slate-400">{formatDate(book.createdAt)}</p>
      </section>

      {/* Table of contents */}
      <section className="book-page-break px-12 py-12">
        <h2 className="mb-6 text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">{strings.contents}</h2>
        <ol className="space-y-2.5 font-serif text-slate-700">
          {book.chapters.map((chapter, index) => {
            // Section dividers are TOC group headers; other chapters indent under them when any
            // section exists, so the contents read as grouped Parts. (M3 richer book structure.)
            if (chapter.kind === 'section') {
              return (
                <li key={`${chapter.kind}-${index}`} className="mt-4 border-t border-slate-200 pt-3 font-serif text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                  {chapter.title}
                </li>
              );
            }
            return (
              <li key={chapter.personId ?? `${chapter.kind}-${index}`} className={`flex items-baseline justify-between gap-4 ${hasSections ? 'pl-4' : ''}`}>
                <span className={chapter.kind === 'overview' ? 'italic' : ''}>{chapter.title}</span>
                {chapter.kind === 'person' && chapter.facts?.lifespanLabel ? (
                  <span className="shrink-0 text-sm text-slate-400">{chapter.facts.lifespanLabel}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Chapters (overview / person / custom / section), rendered in editable order */}
      {book.chapters.map((chapter, index) => {
        // Section dividers render as a centered break page (title + optional blurb), distinct from
        // the narrative chapters. (M3 richer book structure.)
        if (chapter.kind === 'section') {
          return (
            <section key={`${chapter.kind}-${index}`} className="book-page-break flex min-h-[55vh] flex-col items-center justify-center rounded-xl bg-slate-50 px-12 py-16 text-center">
              <h2 className="font-serif text-4xl font-bold uppercase tracking-[0.15em] text-slate-700">{chapter.title}</h2>
              {chapter.narrative ? (
                <p className="mt-5 max-w-xl whitespace-pre-wrap font-serif text-[15px] italic leading-relaxed text-slate-500">{chapter.narrative}</p>
              ) : null}
            </section>
          );
        }
        const isOverview = chapter.kind === 'overview';
        const factBits = [chapter.facts?.lifespanLabel, chapter.facts?.birthPlace].filter(Boolean) as string[];
        return (
          <section key={chapter.personId ?? `${chapter.kind}-${index}`} className="book-page-break px-12 py-12">
            {isOverview ? (
              <h2 className="mb-8 font-serif text-3xl font-bold text-slate-900">{chapter.title}</h2>
            ) : (
              <header className="mb-8 border-b border-slate-200 pb-4">
                <h2 className="font-serif text-3xl font-bold text-slate-900">{chapter.title}</h2>
                {chapter.kind === 'person' && factBits.length > 0 ? (
                  <p className="mt-2 font-serif italic text-slate-500">{factBits.join(' · ')}</p>
                ) : null}
              </header>
            )}
            <p className="whitespace-pre-wrap font-serif text-[17px] leading-[1.85] text-slate-800">
              {chapter.narrative}
            </p>
            {chapter.kind === 'person' && chapter.facts && groundingSummary(chapter.facts) ? (
              <p className="mt-6 text-[11px] italic text-slate-400">{groundingSummary(chapter.facts)}</p>
            ) : null}
          </section>
        );
      })}

      <footer className="px-12 py-10 text-center text-xs text-slate-300">
        {strings.generatedBy} · {formatDate(book.createdAt)}
      </footer>
    </div>
  );
};

export default BookDocument;
