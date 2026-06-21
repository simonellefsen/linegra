import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { FamilyBook } from '../../types';
import BookDocument from './BookDocument';

/**
 * Full-screen book preview rendered into a body-level portal. The toolbar (`.no-print`) is hidden
 * under print, and `.book-print-root` is the only visible subtree — so `window.print()` yields a
 * clean PDF (cover, contents, chapters with page breaks) without the app chrome.
 */
const BookPrintOverlay: React.FC<{ book: FamilyBook; onClose: () => void }> = ({ book, onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const node = (
    <div className="fixed inset-0 z-[100] overflow-auto bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 bg-slate-900 px-6 py-3 text-white shadow-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Book Preview</p>
          <p className="truncate font-bold">{book.title}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-900 transition hover:bg-slate-200"
          >
            <Printer className="h-4 w-4" /> Export PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-slate-600"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
      <div className="book-print-root py-10">
        <BookDocument book={book} />
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default BookPrintOverlay;
