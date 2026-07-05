import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  CircleDot,
  Download,
  GitBranch,
  GitCompare,
  Clock,
  MapPin,
  Keyboard,
  UserPlus,
  Loader2,
} from 'lucide-react';
import type { Person, Relationship, TreeLayoutType } from '../../types';
import { buildAncestorBreadcrumbs } from '../../lib/treeNavigation';
import { exportTreeFromPage } from '../../lib/treeExport';

interface TreeViewToolbarProps {
  layout: TreeLayoutType;
  onLayoutChange: (layout: TreeLayoutType) => void;
  focusPerson: Person | null;
  people: Person[];
  relationships: Relationship[];
  onFocusPerson: (personId: string) => void;
  canAddPerson?: boolean;
  addingPerson?: boolean;
  onAddPerson?: () => void;
}

const MODES: Array<{ id: TreeLayoutType; label: string; icon: React.ReactNode }> = [
  { id: 'pedigree', label: 'Pedigree', icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: 'fan', label: 'Fan', icon: <CircleDot className="w-3.5 h-3.5" /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'map', label: 'Map', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'compare', label: 'Compare', icon: <GitCompare className="w-3.5 h-3.5" /> },
];

const TreeViewToolbar: React.FC<TreeViewToolbarProps> = ({
  layout,
  onLayoutChange,
  focusPerson,
  people,
  relationships,
  onFocusPerson,
  canAddPerson = false,
  addingPerson = false,
  onAddPerson,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const breadcrumbs = useMemo(
    () => buildAncestorBreadcrumbs(focusPerson?.id, people, relationships),
    [focusPerson?.id, people, relationships]
  );

  const handleExport = async (format: 'svg' | 'png' | 'print') => {
    setExportBusy(true);
    try {
      await exportTreeFromPage(format, focusPerson ? `${focusPerson.lastName}-tree` : 'linegra-tree');
    } finally {
      setExportBusy(false);
      setExportOpen(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Focus</p>
            <p className="font-serif font-bold text-slate-900">
              {focusPerson ? `${focusPerson.firstName} ${focusPerson.lastName}` : 'Select a person'}
            </p>
          </div>
          {breadcrumbs.length > 1 && (
            <nav aria-label="Ancestor breadcrumbs" className="flex flex-wrap items-center gap-1 text-xs">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.personId}>
                  {index > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                  <button
                    type="button"
                    onClick={() => onFocusPerson(crumb.personId)}
                    className={`font-medium truncate max-w-[140px] ${
                      crumb.personId === focusPerson?.id
                        ? 'text-sky-700'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onLayoutChange(mode.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] flex items-center gap-1 transition-colors ${
                  layout === mode.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>

          {canAddPerson && onAddPerson && (
            <button
              type="button"
              onClick={onAddPerson}
              disabled={addingPerson}
              className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
              title="Add a person with no family links yet"
            >
              {addingPerson ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              Add person
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((open) => !open)}
              disabled={exportBusy}
              className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 z-20 w-40 rounded-xl border border-slate-200 bg-white shadow-xl p-1">
                {(['svg', 'png', 'print'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => void handleExport(format)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 uppercase tracking-wide"
                  >
                    {format === 'print' ? 'Print / PDF' : format.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowKeys((v) => !v)}
            className={`p-2 rounded-xl border border-slate-200 ${showKeys ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {showKeys && (
        <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          <span className="font-bold text-slate-600">↑↓←→</span> navigate pedigree ·{' '}
          <span className="font-bold text-slate-600">Home</span> reset focus ·{' '}
          <span className="font-bold text-slate-600">/</span> search
        </p>
      )}
    </div>
  );
};

export default TreeViewToolbar;
