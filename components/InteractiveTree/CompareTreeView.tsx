import React, { useMemo } from 'react';
import type { Person, Relationship } from '../../types';
import { computePedigreeScope } from '../../lib/pedigreeScope';
import PedigreeTree from './PedigreeTree';

interface CompareTreeViewProps {
  people: Person[];
  relationships: Relationship[];
  allRelationships?: Relationship[];
  dnaMatchCmById?: Map<string, number>;
  focusId?: string;
  compareId?: string;
  onFocusSelect: (person: Person) => void;
  onCompareSelect: (personId: string) => void;
  maxAncestors?: number;
  maxDescendants?: number;
  showPlaceholders?: boolean;
}

const CompareTreeView: React.FC<CompareTreeViewProps> = ({
  people,
  relationships,
  allRelationships,
  dnaMatchCmById,
  focusId,
  compareId,
  onFocusSelect,
  onCompareSelect,
  maxAncestors = 3,
  maxDescendants = 2,
  showPlaceholders = true,
}) => {
  const peopleOptions = useMemo(
    () => [...people].sort((a, b) => `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`)),
    [people]
  );

  const leftScope = useMemo(() => {
    if (!focusId) return { people: [], relationships: [] };
    return computePedigreeScope(people, relationships, focusId, maxAncestors, maxDescendants);
  }, [people, relationships, focusId, maxAncestors, maxDescendants]);

  const rightScope = useMemo(() => {
    if (!compareId) return { people: [], relationships: [] };
    return computePedigreeScope(people, relationships, compareId, maxAncestors, maxDescendants);
  }, [people, relationships, compareId, maxAncestors, maxDescendants]);

  const focusPerson = focusId ? people.find((p) => p.id === focusId) : null;
  const comparePerson = compareId ? people.find((p) => p.id === compareId) : null;

  return (
    <div data-tree-export-root className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-[28px] p-4 space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Person A
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-serif font-bold text-slate-900"
              value={focusId || ''}
              onChange={(e) => {
                const next = people.find((p) => p.id === e.target.value);
                if (next) onFocusSelect(next);
              }}
            >
              {!focusId && <option value="">Select person…</option>}
              {peopleOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </label>
          {focusPerson ? (
            <div className="rounded-[32px] overflow-hidden [&>div]:h-[52vh] [&>div]:rounded-[32px]">
              <PedigreeTree
                people={leftScope.people}
                relationships={leftScope.relationships}
                allRelationships={allRelationships}
                dnaMatchCmById={dnaMatchCmById}
                focusId={focusId}
                onPersonSelect={onFocusSelect}
                maxAncestors={maxAncestors}
                maxDescendants={maxDescendants}
                showPlaceholders={showPlaceholders}
              />
            </div>
          ) : (
            <div className="h-[52vh] rounded-[32px] border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-sm">
              Choose person A
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-[28px] p-4 space-y-3">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Person B
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-serif font-bold text-slate-900"
              value={compareId || ''}
              onChange={(e) => onCompareSelect(e.target.value)}
            >
              <option value="">Select person…</option>
              {peopleOptions
                .filter((p) => p.id !== focusId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
            </select>
          </label>
          {comparePerson ? (
            <div className="rounded-[32px] overflow-hidden [&>div]:h-[52vh] [&>div]:rounded-[32px]">
              <PedigreeTree
                people={rightScope.people}
                relationships={rightScope.relationships}
                allRelationships={allRelationships}
                dnaMatchCmById={dnaMatchCmById}
                focusId={compareId}
                onPersonSelect={(p) => onCompareSelect(p.id)}
                maxAncestors={maxAncestors}
                maxDescendants={maxDescendants}
                showPlaceholders={showPlaceholders}
              />
            </div>
          ) : (
            <div className="h-[52vh] rounded-[32px] border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-sm">
              Choose person B to compare pedigrees
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompareTreeView;
