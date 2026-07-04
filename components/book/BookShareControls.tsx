import React, { useCallback, useState } from 'react';
import { Check, Copy, Globe, Lock } from 'lucide-react';
import type { FamilyBook } from '../../types';
import { buildPublicBookUrl } from '../../lib/bookShare';
import { isBookPubliclyShareable } from '../../services/books';

interface BookShareControlsProps {
  book: FamilyBook;
  disabled?: boolean;
  onTogglePublic: (next: boolean) => void | Promise<void>;
}

const BookShareControls: React.FC<BookShareControlsProps> = ({ book, disabled, onTogglePublic }) => {
  const [copied, setCopied] = useState(false);
  const shareable = isBookPubliclyShareable(book);
  const shareUrl = buildPublicBookUrl(book.id);

  const handleCopy = useCallback(async () => {
    if (!shareable) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  }, [shareUrl, shareable]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Public sharing</p>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            Anyone with the link can read this book when it is published and the family tree is public.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || book.status !== 'complete'}
          onClick={() => void onTogglePublic(!book.isPublic)}
          title={book.status !== 'complete' ? 'Publish the book before sharing publicly' : undefined}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-40 ${
            book.isPublic
              ? 'bg-sky-100 text-sky-800 border border-sky-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {book.isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {book.isPublic ? 'Public' : 'Private'}
        </button>
      </div>

      {book.status !== 'complete' ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Publish the book before enabling a public share link.
        </p>
      ) : null}

      {shareable ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 font-mono"
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-slate-800"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : book.isPublic && book.status === 'complete' ? (
        <p className="text-xs text-slate-500">
          Link will work once the family tree is marked public in Administrator → Trees.
        </p>
      ) : null}
    </div>
  );
};

export default BookShareControls;
