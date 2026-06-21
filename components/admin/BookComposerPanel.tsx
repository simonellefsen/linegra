import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Eye, Trash2, Sparkles, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Person, Relationship, BookGenerationOptions, BookScope, BookStyle, BookLength, BookLanguage, FamilyBook } from '../../types';
import { planBook, extractYear } from '../../lib/bookComposer';
import { BOOK_LANGUAGES, DEFAULT_BOOK_LANGUAGE } from '../../lib/bookI18n';
import { composeBook, saveFamilyBook, listFamilyBooks, deleteFamilyBook } from '../../services/books';
import { loadArchiveData } from '../../services/archive';
import BookPrintOverlay from '../book/BookPrintOverlay';

interface BookComposerPanelProps {
  treeId: string | null;
  people: Person[];
  relationships: Relationship[];
  activeTreeName?: string | null;
  actor: { id?: string | null; name?: string | null };
}

const STYLE_OPTIONS: Array<{ value: BookStyle; label: string; hint: string }> = [
  { value: 'narrative', label: 'Narrative', hint: 'Warm, story-driven chronicle' },
  { value: 'concise', label: 'Concise', hint: 'Factual, to the point' },
  { value: 'scholarly', label: 'Scholarly', hint: 'Measured, evidence-minded' },
];

const LENGTH_OPTIONS: Array<{ value: BookLength; label: string }> = [
  { value: 'short', label: 'Short (2 ¶)' },
  { value: 'medium', label: 'Medium (4 ¶)' },
  { value: 'long', label: 'Long (6 ¶)' },
];

const SCOPE_OPTIONS: Array<{ value: BookScope; label: string; hint: string }> = [
  { value: 'all', label: 'Whole tree', hint: 'Every person in this tree' },
  { value: 'descendants', label: 'One branch', hint: 'A proband and all their descendants' },
  { value: 'selected', label: 'Selected people', hint: 'Hand-picked individuals' },
];

const personLabel = (person: Person): string => {
  const name = `${person.firstName} ${person.lastName}`.trim() || 'Unknown';
  const year = extractYear(person.birthDate);
  return year ? `${name} (${year})` : name;
};

const formatUpdated = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const BookComposerPanel: React.FC<BookComposerPanelProps> = ({
  treeId,
  people,
  relationships,
  activeTreeName,
  actor,
}) => {
  const [scope, setScope] = useState<BookScope>('all');
  const [style, setStyle] = useState<BookStyle>('narrative');
  const [length, setLength] = useState<BookLength>('medium');
  const [language, setLanguage] = useState<BookLanguage>(DEFAULT_BOOK_LANGUAGE);
  const [probandId, setProbandId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [titleOverride, setTitleOverride] = useState('');
  const [subtitleOverride, setSubtitleOverride] = useState('');
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [savedBooks, setSavedBooks] = useState<FamilyBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewBook, setPreviewBook] = useState<FamilyBook | null>(null);

  // The admin panels share App's `allPeople`, which is only populated once the tree archive is
  // loaded (e.g. via Interactive Tree). Rather than require that, fetch the archive on demand so
  // the Book Studio works straight from the Administrator → Books tab.
  const [archivePeople, setArchivePeople] = useState<Person[]>([]);
  const [archiveRelationships, setArchiveRelationships] = useState<Relationship[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const effectivePeople = people.length > 0 ? people : archivePeople;
  const effectiveRelationships = relationships.length > 0 ? relationships : archiveRelationships;

  useEffect(() => {
    if (!treeId || people.length > 0) return;
    let cancelled = false;
    setArchiveLoading(true);
    loadArchiveData(treeId)
      .then((archive) => {
        if (cancelled) return;
        setArchivePeople(archive.people);
        setArchiveRelationships(archive.relationships);
      })
      .catch((err) => console.error('Failed to load tree archive for books', err))
      .finally(() => {
        if (!cancelled) setArchiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, people.length]);

  const pickerPeople = useMemo(() => {
    return [...effectivePeople].sort((a, b) => {
      const ay = extractYear(a.birthDate) ?? 9999;
      const by = extractYear(b.birthDate) ?? 9999;
      return ay - by;
    });
  }, [effectivePeople]);

  const loadBooks = useCallback(async () => {
    if (!treeId) {
      setSavedBooks([]);
      return;
    }
    setBooksLoading(true);
    try {
      setSavedBooks(await listFamilyBooks(treeId));
    } catch (err) {
      console.error('Failed to load saved books', err);
    } finally {
      setBooksLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const effectiveOptions = useMemo<BookGenerationOptions>(() => {
    const base: BookGenerationOptions = { scope, style, length, language };
    if (scope === 'descendants') base.probandId = probandId || pickerPeople[0]?.id || null;
    if (scope === 'selected') base.selectedIds = selectedIds;
    return base;
  }, [scope, style, length, language, probandId, selectedIds, pickerPeople]);

  const previewPlan = useMemo(() => {
    if (!treeId || !effectivePeople.length) return null;
    return planBook({ name: activeTreeName ?? '' }, effectivePeople, effectiveRelationships, effectiveOptions);
  }, [treeId, effectivePeople, effectiveRelationships, activeTreeName, effectiveOptions]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = useCallback(async () => {
    if (!treeId || !previewPlan) return;
    setGenerating(true);
    setError(null);
    setInfo(null);
    setProgress({ done: 0, total: previewPlan.chapters.length });
    try {
      const { chapters, reusedCount, generatedCount } = await composeBook(
        {
          plan: previewPlan,
          tree: { name: activeTreeName ?? undefined },
          people: effectivePeople,
          options: effectiveOptions,
          treeId,
          actor,
          forceRegenerate,
        },
        (done, total) => setProgress({ done, total })
      );
      const title = titleOverride.trim() || previewPlan.title;
      const subtitle = subtitleOverride.trim() || previewPlan.subtitle;
      const bookId = await saveFamilyBook({
        bookId: null,
        treeId,
        title,
        subtitle,
        status: 'complete',
        options: effectiveOptions,
        chapters,
        statistics: previewPlan.statistics,
        isPublic: false,
        actor,
      });
      setInfo(
        `Saved "${title}" — ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} ` +
          `(${generatedCount} written by AI, ${reusedCount} reused unchanged).`
      );
      await loadBooks();
      // Build the preview locally from the data we already have rather than re-fetching (the row
      // can take a moment to be visible to a direct RLS read right after the RPC insert).
      const now = new Date().toISOString();
      setPreviewBook({
        id: bookId,
        treeId,
        title,
        subtitle,
        status: 'complete',
        isPublic: false,
        options: effectiveOptions,
        chapters,
        statistics: previewPlan.statistics,
        createdById: actor.id ?? null,
        createdByName: actor.name ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the book.');
    } finally {
      setGenerating(false);
    }
  }, [treeId, previewPlan, activeTreeName, effectivePeople, effectiveOptions, titleOverride, subtitleOverride, actor, forceRegenerate, loadBooks]);

  const handleDelete = useCallback(
    async (book: FamilyBook) => {
      if (!window.confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
      setDeletingId(book.id);
      try {
        await deleteFamilyBook(book.id, actor);
        await loadBooks();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete the book.');
      } finally {
        setDeletingId(null);
      }
    },
    [actor, loadBooks]
  );

  if (!treeId) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white p-12 text-center shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-slate-900">No Active Tree</h2>
        <p className="mt-2 text-slate-500">Choose a family tree before composing a book.</p>
      </div>
    );
  }

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900">Family Book Studio</h2>
            <p className="text-sm text-slate-500">
              Compose an AI-written family-history book from {activeTreeName ?? 'this tree'}, with each life set in its
              historical context. Export to PDF for print.
            </p>
          </div>
        </div>

        {/* Scope + style + length */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Scope</label>
            <div className="space-y-2">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                    scope === opt.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-bold">{opt.label}</span>
                  <span className={`block text-xs ${scope === opt.value ? 'text-slate-300' : 'text-slate-400'}`}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Style</label>
            <div className="space-y-2">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStyle(opt.value)}
                  className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                    style === opt.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-bold">{opt.label}</span>
                  <span className={`block text-xs ${style === opt.value ? 'text-slate-300' : 'text-slate-400'}`}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Length</label>
            <div className="space-y-2">
              {LENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLength(opt.value)}
                  className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                    length === opt.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-sm font-bold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Language</label>
            <div className="grid grid-cols-2 gap-2">
              {BOOK_LANGUAGES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLanguage(opt.value)}
                  className={`rounded-2xl border px-3 py-2 text-center transition ${
                    language === opt.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  title={opt.label}
                >
                  <span className="block text-sm font-bold">{opt.native}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scope-specific pickers */}
        {scope === 'descendants' ? (
          <div className="mt-5">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Branch root (proband)
            </label>
            <select
              value={probandId || pickerPeople[0]?.id || ''}
              onChange={(e) => setProbandId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {pickerPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {personLabel(p)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {scope === 'selected' ? (
          <div className="mt-5">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              People ({selectedIds.length} selected)
            </label>
            <div className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white p-2">
              {pickerPeople.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    className="h-4 w-4 accent-slate-900"
                  />
                  <span className="text-sm text-slate-700">{personLabel(p)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {/* Title overrides */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Title (optional)
            </label>
            <input
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={previewPlan?.title ?? 'Family History'}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Subtitle (optional)
            </label>
            <input
              value={subtitleOverride}
              onChange={(e) => setSubtitleOverride(e.target.value)}
              placeholder={previewPlan?.subtitle ?? ''}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
        </div>

        {/* Preview summary + generate */}
        <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            {previewPlan ? (
              <>
                <span className="font-bold text-slate-700">{previewPlan.chapters.length}</span> chapter
                {previewPlan.chapters.length === 1 ? '' : 's'} ·{' '}
                <span className="font-bold text-slate-700">{previewPlan.statistics.personCount}</span> people
                {previewPlan.statistics.earliestBirthYear != null && previewPlan.statistics.latestDeathYear != null
                  ? ` · ${previewPlan.statistics.earliestBirthYear}–${previewPlan.statistics.latestDeathYear}`
                  : ''}
              </>
            ) : archiveLoading ? (
              'Loading people from the archive…'
            ) : (
              'Add people to this tree to compose a book.'
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500" title="By default, only people who changed since their last biography are re-written by the AI; everyone else is reused.">
              <input
                type="checkbox"
                checked={forceRegenerate}
                onChange={(e) => setForceRegenerate(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Re-write every chapter
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !previewPlan}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {generating ? `Generating… ${progress.done}/${progress.total}` : 'Generate Book'}
            </button>
          </div>
        </div>

        {generating && progress.total > 0 ? (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {info && !generating ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{info}</span>
          </div>
        ) : null}
      </div>

      {/* Saved books */}
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Saved Books</h3>
          <button
            type="button"
            onClick={loadBooks}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {booksLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : savedBooks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No books yet. Generate one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {savedBooks.map((book) => (
              <li key={book.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg font-bold text-slate-900">{book.title}</p>
                  <p className="truncate text-sm text-slate-500">
                    {book.chapters.length} chapters · {formatUpdated(book.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewBook(book)}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" /> Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(book)}
                    disabled={deletingId === book.id}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {previewBook ? <BookPrintOverlay book={previewBook} onClose={() => setPreviewBook(null)} /> : null}
    </div>
  );
};

export default BookComposerPanel;
