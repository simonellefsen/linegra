import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { FamilyLayoutAudit } from '../../types';

interface AdminDatabasePanelProps {
  supabaseActive: boolean;
  nukeSuccess: boolean;
  layoutAudits: FamilyLayoutAudit[];
  hasMoreAudits: boolean;
  onLaunchNuke: () => void;
  onLoadMoreAudits: () => void;
}

const AdminDatabasePanel: React.FC<AdminDatabasePanelProps> = ({
  supabaseActive,
  nukeSuccess,
  layoutAudits,
  hasMoreAudits,
  onLaunchNuke,
  onLoadMoreAudits,
}) => (
  <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 text-slate-600 space-y-6">
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Database Panel</p>
        <h3 className="text-2xl font-serif font-bold text-slate-900 mb-2">Reset & Maintenance</h3>
        <p className="text-sm text-slate-500 max-w-2xl">
          Wipe every person, relationship, media record, and audit trail stored in Supabase. This is intended for
          staging environments when you need to re-import large GEDCOM datasets from scratch. Production archives
          should never run this action during active research sessions.
        </p>
      </div>
      <div className="border border-rose-100 bg-rose-50/70 rounded-[28px] p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-rose-600">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em]">Destructive Operation</p>
            <h4 className="text-lg font-serif font-bold text-slate-900">Nuke Supabase Database</h4>
          </div>
        </div>
        <p className="text-sm text-rose-700">
          This permanently removes all family trees, GEDCOM imports, media, notes, sources, audit logs, and places. A fresh
          seed tree will need to be created afterward. The action cannot be undone.
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={onLaunchNuke}
            className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-rose-700 transition-all disabled:opacity-60"
            disabled={!supabaseActive}
          >
            {supabaseActive ? 'Launch Nuke' : 'Link Supabase First'}
          </button>
          {nukeSuccess && (
            <span className="text-emerald-600 text-xs font-bold uppercase tracking-[0.3em]">Database Reset</span>
          )}
        </div>
      </div>
    </div>

    {supabaseActive && Array.isArray(layoutAudits) && layoutAudits.length > 0 && (
      <div className="border border-slate-100 rounded-[28px] p-6 space-y-4 bg-slate-50/70">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Family Layout History</p>
            <h4 className="text-lg font-serif font-bold text-slate-900">Recent Kinship Edits</h4>
          </div>
        </div>
        <div className="space-y-3">
          {layoutAudits.map((audit) => {
            const assignmentCount = Object.keys(audit.layout.assignments ?? {}).length;
            const manualGroups = Object.values(audit.layout.manualOrders ?? {}) as string[][];
            const manualCount = manualGroups.reduce((total, group) => total + group.length, 0);
            return (
              <div key={audit.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800">{audit.actorName}</p>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                    {new Date(audit.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {assignmentCount} child links, {manualCount} manual placements
                </p>
              </div>
            );
          })}
        </div>
        {hasMoreAudits && (
          <button
            onClick={onLoadMoreAudits}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 hover:underline"
          >
            View More
          </button>
        )}
      </div>
    )}
  </div>
);

export default AdminDatabasePanel;
