import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import type { DNASharedSegmentRowPreview, DNASharedSegmentSummary } from '../../types';
import {
  csvKitOwnerDisplayName,
  shouldOfferMarriedNameAlias,
  suggestCounterpartPersonId,
  suggestKitOwnerPersonId,
  type SharedImportNameRow,
} from '../../lib/dnaSharedImportOwner';

export interface SharedSegmentImportConfirmPayload {
  ownerPersonId: string;
  counterpartPersonId?: string | null;
  saveMarriedNameAlias?: boolean;
  marriedNameAlias?: string;
}

interface SharedSegmentImportModalProps {
  open: boolean;
  summary: DNASharedSegmentSummary;
  preview: DNASharedSegmentRowPreview[];
  treePeople: SharedImportNameRow[];
  defaultOwnerPersonId?: string | null;
  loadingPeople?: boolean;
  lockOwnerPersonId?: string | null;
  onClose: () => void;
  onConfirm: (payload: SharedSegmentImportConfirmPayload) => void;
}

const SharedSegmentImportModal: React.FC<SharedSegmentImportModalProps> = ({
  open,
  summary,
  preview,
  treePeople,
  defaultOwnerPersonId,
  lockOwnerPersonId,
  loadingPeople = false,
  onClose,
  onConfirm,
}) => {
  const suggestedOwnerId = useMemo(
    () => suggestKitOwnerPersonId(summary, treePeople, defaultOwnerPersonId),
    [summary, treePeople, defaultOwnerPersonId]
  );
  const [ownerPersonId, setOwnerPersonId] = useState<string>('');
  const [counterpartPersonId, setCounterpartPersonId] = useState<string>('');
  const [saveMarriedAlias, setSaveMarriedAlias] = useState(true);
  const lockedOwnerId = lockOwnerPersonId || '';

  useEffect(() => {
    if (!open) return;
    const nextOwner = lockedOwnerId || suggestedOwnerId || defaultOwnerPersonId || '';
    setOwnerPersonId(nextOwner);
    const counterpart = nextOwner
      ? suggestCounterpartPersonId(summary, nextOwner, treePeople)
      : null;
    setCounterpartPersonId(counterpart || '');
    setSaveMarriedAlias(true);
  }, [open, suggestedOwnerId, defaultOwnerPersonId, summary, treePeople, lockedOwnerId]);

  useEffect(() => {
    if (!open || !ownerPersonId) return;
    const counterpart = suggestCounterpartPersonId(summary, ownerPersonId, treePeople);
    setCounterpartPersonId(counterpart || '');
  }, [open, ownerPersonId, summary, treePeople]);

  if (!open) return null;

  const csvOwnerName = ownerPersonId
    ? csvKitOwnerDisplayName(summary, ownerPersonId, treePeople)
    : summary.personName;
  const offerMarriedAlias =
    !!ownerPersonId &&
    shouldOfferMarriedNameAlias(summary, ownerPersonId, treePeople, csvOwnerName);

  const handleConfirm = () => {
    const resolvedOwner = lockedOwnerId || ownerPersonId;
    if (!resolvedOwner) return;
    onConfirm({
      ownerPersonId: resolvedOwner,
      counterpartPersonId: counterpartPersonId || null,
      saveMarriedNameAlias: offerMarriedAlias && saveMarriedAlias,
      marriedNameAlias: offerMarriedAlias && saveMarriedAlias ? csvOwnerName : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-500">
              Shared segment import
            </p>
            <h3 className="text-lg font-serif font-bold text-slate-900 mt-1">Confirm kit owner</h3>
            <p className="text-sm text-slate-500 mt-1 truncate" title={summary.fileName}>
              {summary.fileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
            <p>
              <span className="text-slate-500">CSV parties:</span>{' '}
              <span className="font-semibold text-slate-800">{summary.personName}</span>
              <span className="text-slate-400"> vs </span>
              <span className="font-semibold text-slate-800">{summary.matchName}</span>
            </p>
            <p className="text-slate-600">
              {summary.segmentCount} segments · {summary.totalCentimorgans.toFixed(1)} cM
            </p>
            {preview.length > 0 && (
              <p className="text-xs text-slate-400">Preview loaded ({preview.length} rows).</p>
            )}
          </div>

          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Kit owner (required)
            </span>
            {lockedOwnerId ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-800">
                {treePeople.find((person) => person.id === lockedOwnerId)
                  ? [treePeople.find((person) => person.id === lockedOwnerId)?.first_name, treePeople.find((person) => person.id === lockedOwnerId)?.last_name]
                      .filter(Boolean)
                      .join(' ')
                  : 'Current profile'}
              </p>
            ) : loadingPeople ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading tree people…
              </div>
            ) : (
              <select
                value={ownerPersonId}
                onChange={(event) => setOwnerPersonId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800"
              >
                <option value="">Select kit owner…</option>
                {treePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {[person.first_name, person.last_name].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate-500">
              The person whose autosomal test produced this comparison list. Stored as the test owner
              and used instead of guessing from CSV names.
            </p>
          </label>

          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Counterpart (optional)
            </span>
            <select
              value={counterpartPersonId}
              onChange={(event) => setCounterpartPersonId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800"
              disabled={!ownerPersonId}
            >
              <option value="">Leave unlinked — {summary.matchName || 'unknown match'}</option>
              {treePeople
                .filter((person) => person.id !== ownerPersonId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {[person.first_name, person.last_name].filter(Boolean).join(' ')}
                  </option>
                ))}
            </select>
          </label>

          {offerMarriedAlias && (
            <label className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveMarriedAlias}
                onChange={(event) => setSaveMarriedAlias(event.target.checked)}
                className="mt-1 rounded border-slate-300 text-violet-600"
              />
              <span className="text-slate-700">
                Save <span className="font-semibold">{csvOwnerName}</span> as a married-name alias on
                the kit owner (helps future CSV / GEDCOM name matching).
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ownerPersonId && !lockedOwnerId || loadingPeople}
            onClick={handleConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            Import match
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharedSegmentImportModal;
