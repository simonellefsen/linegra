import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface AdminNukeModalProps {
  open: boolean;
  confirmText: string;
  inProgress: boolean;
  error: string | null;
  onChangeConfirmText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const AdminNukeModal: React.FC<AdminNukeModalProps> = ({
  open,
  confirmText,
  inProgress,
  error,
  onChangeConfirmText,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full p-8 space-y-6">
        <div className="flex items-center gap-3 text-rose-600">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em]">Confirm Database Reset</p>
            <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Type "NUKE" to proceed</h3>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          This action truncates every record in Supabase and cannot be undone. Only run this on staging projects when you
          need a clean slate for GEDCOM ingestion tests. Production archives should take a backup first.
        </p>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Confirmation Text</label>
          <input
            value={confirmText}
            onChange={(e) => onChangeConfirmText(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900/5 outline-none uppercase tracking-[0.3em]"
            placeholder="NUKE"
            disabled={inProgress}
          />
        </div>
        {error && <p className="text-rose-600 text-xs font-bold">{error}</p>}
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-100 transition-all"
            disabled={inProgress}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black uppercase tracking-[0.3em] hover:bg-rose-700 transition-all disabled:opacity-60"
            disabled={inProgress}
          >
            {inProgress ? 'Purging…' : 'Confirm Reset'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminNukeModal;
