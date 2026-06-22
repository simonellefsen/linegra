import React, { useCallback, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { BookLanguage } from '../../types';
import { aiAssistedEdit, AiEditOp } from '../../services/ai';
import { BOOK_LANGUAGES } from '../../lib/bookI18n';

interface AiTextOpsProps {
  /** The current text in the editor (the passage the ops transform). */
  value: string;
  /** Called with the transformed text — the parent updates its editor state. */
  onApply: (newText: string) => void;
  language: BookLanguage;
  disabled?: boolean;
}

const OPS: Array<{ op: AiEditOp; label: string }> = [
  { op: 'rewrite', label: 'Rewrite' },
  { op: 'formal', label: 'Formal' },
  { op: 'concise', label: 'Concise' },
  { op: 'expand', label: 'Expand' },
];

/**
 * A row of AI editing operations applied to the editor's current text — rewrite, restyle, expand, or
 * translate — as an alternative to regenerating from facts (M6/M1). Reused by the StoryTab bio editor
 * and each BookEditor chapter. Transforms whatever is in the editor (including a curator's draft);
 * the result lands back in the editor for further human editing. Roadmap M10.
 */
const AiTextOps: React.FC<AiTextOpsProps> = ({ value, onApply, language, disabled }) => {
  const [running, setRunning] = useState<AiEditOp | null>(null);
  const [target, setTarget] = useState<BookLanguage>(language === 'en' ? 'da' : 'en');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (op: AiEditOp) => {
      if (!value.trim() || disabled) return;
      setRunning(op);
      setError(null);
      try {
        const result = await aiAssistedEdit(value, op, { language, targetLanguage: target });
        onApply(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI edit failed.');
      } finally {
        setRunning(null);
      }
    },
    [value, disabled, language, target, onApply]
  );

  const busy = running !== null;
  const idle = disabled || !value.trim();

  const button = (op: AiEditOp, label: string) => (
    <button
      key={op}
      type="button"
      onClick={() => run(op)}
      disabled={busy || idle}
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40"
    >
      {running === op ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">AI</span>
      {OPS.map((o) => button(o.op, o.label))}
      {button('translate', 'Translate')}
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value as BookLanguage)}
        disabled={busy}
        title="Translate to this language"
        className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-600"
      >
        {BOOK_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.native}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10px] font-semibold text-rose-500">{error}</span> : null}
    </div>
  );
};

export default AiTextOps;
