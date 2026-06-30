import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Plus, Trash2, Save, Loader2, Eye, X, AlertCircle, RefreshCw, Lock, Unlock, History, Upload } from 'lucide-react';
import { FamilyBook, BookChapter, BookChapterKind, BookChapterStatus, BookStatus, Person } from '../../types';
import { saveFamilyBook } from '../../services/books';
import { composePersonBiography, composeFamilyOverview } from '../../services/ai';
import { moveChapter, removeChapter, createCustomChapter, createSectionChapter } from '../../lib/bookComposer';
import { createBookVersion, recordVersion, matchesVersion, restoreVersion, BookVersion } from '../../lib/bookVersions';
import { loadVersionHistory, saveVersionHistory } from '../../lib/bookVersionStore';
import BookPrintOverlay from './BookPrintOverlay';
import AiTextOps from '../common/AiTextOps';

interface BookEditorProps {
  book: FamilyBook;
  people?: Person[];
  treeName?: string | null;
  actor: { id?: string | null; name?: string | null };
  onClose: () => void;
  onSaved: () => void;
}

const KIND_LABEL: Record<BookChapterKind, string> = {
  overview: 'Overview',
  person: 'Person',
  custom: 'Custom',
  section: 'Section',
};

const KIND_BADGE: Record<BookChapterKind, string> = {
  overview: 'bg-sky-100 text-sky-700',
  person: 'bg-slate-100 text-slate-600',
  custom: 'bg-emerald-100 text-emerald-700',
  section: 'bg-violet-100 text-violet-700',
};

const STATUS_LABEL: Record<BookChapterStatus, string> = {
  draft: 'Draft',
  edited: 'Edited',
  locked: 'Locked',
};

const STATUS_BADGE: Record<BookChapterStatus, string> = {
  draft: 'bg-slate-100 text-slate-500',
  edited: 'bg-amber-100 text-amber-700',
  locked: 'bg-rose-100 text-rose-700',
};

const isRegenerable = (kind: BookChapterKind) => kind === 'overview' || kind === 'person';

/**
 * Full-screen editor for a saved family book. Edits title/subtitle and each chapter's title +
 * narrative, reorders chapters, and adds/removes custom (free-text) chapters. Saves via the
 * `saveFamilyBook` upsert (bookId set → updates the existing book). Per
 * wiki/decisions/ai-narrative-editing-and-grounding.md, AI-generated chapter text is freely
 * editable — this is where a curator rewrites, trims, or restructures the book by hand.
 */
const BookEditor: React.FC<BookEditorProps> = ({ book, people = [], treeName, actor, onClose, onSaved }) => {
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '');
  const [chapters, setChapters] = useState<BookChapter[]>(book.chapters);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<BookVersion[]>(() => loadVersionHistory(book.id));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, saving]);

  // A live, unsaved copy for the preview overlay (does not persist until Save).
  const workingBook = useMemo<FamilyBook>(
    () => ({ ...book, title: title.trim() || book.title, subtitle: subtitle.trim() || null, chapters }),
    [book, title, subtitle, chapters]
  );

  const updateChapter = useCallback((index: number, patch: Partial<BookChapter>) => {
    setChapters((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const merged = { ...c, ...patch };
        // Editing the title or narrative marks the chapter human-edited — unless the caller set an
        // explicit `status` (e.g. regenerate resets to 'draft') or the chapter is locked.
        if (!('status' in patch) && ('narrative' in patch || 'title' in patch) && c.status !== 'locked') {
          merged.status = 'edited';
        }
        return merged;
      })
    );
  }, []);

  const setChapterStatus = useCallback((index: number, status: BookChapterStatus) => {
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, status } : c)));
  }, []);

  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  // Re-compose just one chapter with the AI (overview or person), leaving the rest of the book
  // intact. Custom (hand-written) chapters aren't regenerable. Uses the book's own options.
  const handleRegenerate = useCallback(
    async (index: number) => {
      const chapter = chapters[index];
      if (!chapter || !isRegenerable(chapter.kind)) return;
      setRegeneratingIndex(index);
      setError(null);
      try {
        let narrative: string;
        if (chapter.kind === 'overview') {
          narrative = await composeFamilyOverview({ name: treeName ?? undefined }, book.statistics, book.options);
        } else {
          const person = people.find((p) => p.id === chapter.personId);
          if (!person) {
            throw new Error('This person is not loaded — reload the tree to regenerate their chapter.');
          }
          narrative = await composePersonBiography(person, chapter.facts ?? {}, book.options);
        }
        updateChapter(index, { narrative, status: 'draft' });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not regenerate this chapter.');
      } finally {
        setRegeneratingIndex(null);
      }
    },
    [chapters, book, treeName, people, updateChapter]
  );

  // Persist the book with a given status, then record a version snapshot of what was saved (M4).
  // `label` ('Save' | 'Publish') tags the history entry. Versions dedup against the latest, so an
  // unchanged save is a no-op in history.
  const persist = useCallback(
    async (nextStatus: BookStatus, label: 'Save' | 'Publish') => {
      setSaving(true);
      setError(null);
      try {
        await saveFamilyBook({
          bookId: book.id,
          treeId: book.treeId,
          title: title.trim() || book.title,
          subtitle: subtitle.trim() || null,
          status: nextStatus,
          options: book.options,
          chapters,
          statistics: book.statistics,
          isPublic: book.isPublic,
          actor,
        });
        const snapshot = createBookVersion(
          { title: title.trim() || book.title, subtitle: subtitle.trim() || null, chapters },
          label,
          { id: `v-${Date.now()}`, createdAt: new Date().toISOString() }
        );
        setHistory((prev) => {
          const next = recordVersion(prev, snapshot);
          saveVersionHistory(book.id, next);
          return next;
        });
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the book.');
      } finally {
        setSaving(false);
      }
    },
    [book, title, subtitle, chapters, actor, onSaved, onClose]
  );

  const handleSave = useCallback(() => persist(book.status, 'Save'), [persist, book.status]);
  const handlePublish = useCallback(() => persist('complete', 'Publish'), [persist]);

  const handleRestore = useCallback(
    (version: BookVersion) => {
      const restored = restoreVersion(book, version);
      setTitle(restored.title);
      setSubtitle(restored.subtitle ?? '');
      setChapters(restored.chapters);
      setHistoryOpen(false);
    },
    [book]
  );

  const node = (
    <div className="fixed inset-0 z-[100] overflow-auto bg-slate-100">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-slate-900 px-6 py-3 text-white shadow-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Edit Book</p>
          <p className="truncate font-bold">{title.trim() || book.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {book.status === 'complete' ? (
            <span className="hidden rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 sm:inline">
              Published
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={saving}
              title="Save and mark this book as a published version"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> Publish
            </button>
          )}
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-600 disabled:opacity-50"
          >
            <History className="h-4 w-4" /> History
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-600 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" /> Preview
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        {/* Book title + subtitle */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 font-serif text-lg font-bold text-slate-900 outline-none focus:border-slate-400"
          />
          <label className="mt-3 mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Subtitle</label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="(optional)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          />
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Version history (M4) — snapshots recorded on each Save/Publish; restore loads one as a draft. */}
        {historyOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Version history</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No saved versions yet. Saving or publishing records a snapshot you can restore here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((v) => {
                  const current = matchesVersion(
                    { title: title.trim() || book.title, subtitle: subtitle.trim() || null, chapters },
                    v
                  );
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {v.label}
                          {v.label === 'Publish' ? (
                            <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-emerald-600">Published</span>
                          ) : null}
                          {current ? (
                            <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-blue-600">Editing</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(v.createdAt).toLocaleString()} · {v.chapters.length} chapters
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore(v)}
                        disabled={current}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                      >
                        Restore
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[10px] italic text-slate-400">
              Versions are stored in this browser. A restored version becomes a draft until you Save.
            </p>
          </div>
        ) : null}

        {/* Chapter list */}
        {chapters.map((chapter, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] ${KIND_BADGE[chapter.kind]}`}>
                {KIND_LABEL[chapter.kind]}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] ${STATUS_BADGE[chapter.status ?? 'draft']}`}>
                {STATUS_LABEL[chapter.status ?? 'draft']}
              </span>
              <input
                value={chapter.title}
                readOnly={chapter.status === 'locked'}
                onChange={(e) => updateChapter(index, { title: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 font-serif text-base font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-slate-400 read-only:bg-slate-50"
              />
              {isRegenerable(chapter.kind) ? (
                <button
                  type="button"
                  onClick={() => handleRegenerate(index)}
                  disabled={regeneratingIndex !== null || chapter.status === 'locked'}
                  title={chapter.status === 'locked' ? 'Unlock to regenerate' : 'Regenerate this chapter with AI'}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {regeneratingIndex === index ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {regeneratingIndex === index ? 'Writing…' : 'Regenerate'}
                </button>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChapterStatus(index, chapter.status === 'locked' ? 'edited' : 'locked')}
                  title={chapter.status === 'locked' ? 'Unlock chapter' : 'Lock chapter (freeze text + regenerate)'}
                  className={`rounded-lg p-1.5 hover:bg-slate-100 ${chapter.status === 'locked' ? 'text-rose-500' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  {chapter.status === 'locked' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setChapters((prev) => moveChapter(prev, index, -1))}
                  disabled={index === 0}
                  title="Move up"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setChapters((prev) => moveChapter(prev, index, 1))}
                  disabled={index === chapters.length - 1}
                  title="Move down"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setChapters((prev) => removeChapter(prev, index))}
                  title="Remove chapter"
                  className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <textarea
              value={chapter.narrative}
              readOnly={chapter.status === 'locked'}
              onChange={(e) => updateChapter(index, { narrative: e.target.value })}
              placeholder={chapter.kind === 'section' ? 'Optional blurb under the section divider…' : 'Chapter text…'}
              className={`${chapter.kind === 'section' ? 'min-h-[80px]' : 'min-h-[180px]'} w-full resize-y rounded-xl border border-slate-200 p-3 font-serif text-[15px] leading-relaxed text-slate-800 outline-none focus:border-slate-400 read-only:bg-slate-50`}
            />
            {chapter.status !== 'locked' ? (
              <div className="mt-2">
                <AiTextOps
                  value={chapter.narrative}
                  onApply={(t) => updateChapter(index, { narrative: t })}
                  language={book.options.language}
                />
              </div>
            ) : null}
          </div>
        ))}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setChapters((prev) => [...prev, createSectionChapter()])}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 py-4 text-xs font-bold uppercase tracking-widest text-violet-600 transition hover:border-violet-400 hover:text-violet-800"
          >
            <Plus className="h-4 w-4" /> Add section divider
          </button>
          <button
            type="button"
            onClick={() => setChapters((prev) => [...prev, createCustomChapter()])}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:border-slate-400 hover:text-slate-800"
          >
            <Plus className="h-4 w-4" /> Add custom chapter
          </button>
        </div>

        <p className="pb-4 text-center text-[11px] text-slate-400">
          Changes are saved only when you press <span className="font-bold">Save</span>. Close discards unsaved edits.
        </p>
      </div>

      {preview ? <BookPrintOverlay book={workingBook} onClose={() => setPreview(false)} /> : null}
    </div>
  );

  return createPortal(node, document.body);
};

export default BookEditor;
