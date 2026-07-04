import React, { useEffect, useState } from 'react';
import { AlertCircle, Home, Loader2, Printer } from 'lucide-react';
import { fetchPublicFamilyBook } from '../../services/books';
import { isSupabaseConfigured } from '../../lib/supabase';
import BookDocument from './BookDocument';
import type { FamilyBook } from '../../types';

interface PublicBookViewerPageProps {
  bookId: string;
}

const PublicBookViewerPage: React.FC<PublicBookViewerPageProps> = ({ bookId }) => {
  const [book, setBook] = useState<FamilyBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (!isSupabaseConfigured()) {
      setError('This archive is not connected to a database.');
      setLoading(false);
      return;
    }

    fetchPublicFamilyBook(bookId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setError(
            'This book is not available. It may be private, still a draft, or the family tree may not be public.'
          );
          setBook(null);
          return;
        }
        setBook(row);
        document.title = `${row.title} · Linegra`;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this book.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm font-medium">Loading family book…</p>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm space-y-4">
          <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="font-serif text-2xl font-bold text-slate-900">Book unavailable</h1>
          <p className="text-sm text-slate-600 leading-relaxed">{error ?? 'Unknown error.'}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800"
          >
            <Home className="w-4 h-4" /> Linegra home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Shared family book</p>
          <p className="truncate font-serif text-lg font-bold text-slate-900">{book.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
          <a
            href="/"
            className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" /> Linegra
          </a>
        </div>
      </div>
      <div className="book-print-root py-8 sm:py-12">
        <BookDocument book={book} />
      </div>
    </div>
  );
};

export default PublicBookViewerPage;
