import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { DnaConsentScope } from '../../types';

interface DnaRawConsentModalProps {
  open: boolean;
  fileName: string;
  encryptionAvailable: boolean;
  onCancel: () => void;
  onConfirm: (scope: DnaConsentScope) => void;
}

const DnaRawConsentModal: React.FC<DnaRawConsentModalProps> = ({
  open,
  fileName,
  encryptionAvailable,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 text-white p-6 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-200">Raw DNA consent</p>
            <h3 className="text-lg font-serif font-bold mt-1">Store autosomal raw data?</h3>
            <p className="text-sm text-white/70 mt-2">
              {fileName} contains per-SNP genotype data — sensitive, hereditary biometric information.
              Choose how Linegra may persist it.
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <button
            type="button"
            onClick={() => onConfirm('derived_only')}
            className="w-full text-left rounded-2xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
          >
            <p className="font-semibold">Summary only (recommended)</p>
            <p className="text-xs text-white/60 mt-1">Keep marker counts and a 25-row preview. No encrypted SNP index.</p>
          </button>
          <button
            type="button"
            disabled={!encryptionAvailable}
            onClick={() => onConfirm('raw_autosomal_storage')}
            className="w-full text-left rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            <p className="font-semibold">Encrypted SNP index</p>
            <p className="text-xs text-white/60 mt-1">
              Build a full marker index, encrypt at rest, and mark the test private.
              {!encryptionAvailable && ' Requires VITE_DNA_ENCRYPTION_KEY.'}
            </p>
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-2xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 hover:bg-white/5"
        >
          Cancel import
        </button>
      </div>
    </div>
  );
};

export default DnaRawConsentModal;
