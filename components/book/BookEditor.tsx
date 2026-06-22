import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Plus, Trash2, Save, Loader2, Eye, X, AlertCircle } from 'lucide-react';
import { FamilyBook, BookChapter, BookChapterKind } from '../../types';
import { saveFamilyBook } from '../../services/books';
import { moveChapter, removeChapter, createCustomChapter } from '../../lib/bookComposer';
import BookPrintOverlay from './BookPrintOverlay';

interface BookEditorProps {
  book: FamilyBook;
  actor: { id?: string | null; name?: string | null };
  onClose: () => void;
  onSaved: () => void;
}

const KIND_LABEL: Record<BookChapterKind, string> = {
  overview: 'Overview',
  person: 'Person',
  custom: 'Custom',
};

const KIND_BADGE: Record<BookChapterKind, string> = {
  overview: 'bg-sky-100 text-sky-700',
  person: 'bg-slate-100 text-slate-600',
  custom: 'bg-emerald-100 text-emerald-700',
};

/**
 * Full-screen editor for a saved family book. Edits title/subtitle and each chapter's title +
 * narrative, reorders chapters, and adds/removes custom (free-text) chapters. Saves via the
 * `saveFamilyBook` upsert (bookId set → updates the existing book). Per
 * wiki/decisions/ai-narrative-editing-and-grounding.md, AI-generated chapter text is freely
 * editable — this is where a curator rewrites, trims, or restructures the book by hand.
 */
const BookEditor: React.FC<BookEditorProps> = ({ book, actor, onClose, onSaved }) => {
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '');
  const [chapters, setChapters] = useState<BookChapter[]>(book.chapters);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

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
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFamilyBook({
        bookId: book.id,
        treeId: book.treeId,
        title: title.trim() || book.title,
        subtitle: subtitle.trim() || null,
        status: book.status,
        options: book.options,
        chapters,
        statistics: book.statistics,
        isPublic: book.isPublic,
        actor,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the book.');
    } finally {
      setSaving(false);
    }
  }, [book, title, subtitle, chapters, actor, onSaved, onClose]);

  const node = (
    <div className="fixed inset-0 z-[100] overflow-auto bg-slate-100">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-slate-900 px-6 py-3 text-white shadow-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Edit Book</p>
          <p className="truncate font-bold">{title.trim() || book.title}</p>
        </div>
        <div className="flex shrink-0 gap-2">
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

        {/* Chapter list */}
        {chapters.map((chapter, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] ${KIND_BADGE[chapter.kind]}`}>
                {KIND_LABEL[chapter.kind]}
              </span>
              <input
                value={chapter.title}
                onChange={(e) => updateChapter(index, { title: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 font-serif text-base font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-slate-400"
              />
              <div className="flex items-center gap-1">
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
              onChange={(e) => updateChapter(index, { narrative: e.target.value })}
              placeholder="Chapter text…"
              className="min-h-[180px] w-full resize-y rounded-xl border border-slate-200 p-3 font-serif text-[15px] leading-relaxed text-slate-800 outline-none focus:border-slate-400"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => setChapters((prev) => [...prev, createCustomChapter()])}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:border-slate-400 hover:text-slate-800"
        >
          <Plus className="h-4 w-4" /> Add custom chapter
        </button>

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
