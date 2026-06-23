import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Person, Relationship } from '../../types';
import { computeRelationship } from '../../lib/relationshipCalculator';

interface RelationshipCalculatorProps {
  people: Person[];
  relationships: Relationship[];
  onOpenPerson?: (personId: string) => void;
}

const fullName = (p?: Person): string => (p ? `${p.firstName} ${p.lastName}`.trim() || 'Unknown' : 'Unknown');

/**
 * "How is A related to B?" — picks two people, derives the genealogical label via
 * lib/relationshipCalculator.ts, and shows the common ancestor + the A→B path. Rendered as a card
 * in the Research tab. Roadmap item P.
 */
const RelationshipCalculator: React.FC<RelationshipCalculatorProps> = ({ people, relationships, onOpenPerson }) => {
  const sorted = useMemo(() => [...people].sort((a, b) => fullName(a).localeCompare(fullName(b))), [people]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');

  const a = people.find((p) => p.id === aId);
  const b = people.find((p) => p.id === bId);
  const result = useMemo(() => {
    if (!aId || !bId) return null;
    return computeRelationship(aId, bId, relationships);
  }, [aId, bId, relationships]);
  const byId = (id: string) => people.find((p) => p.id === id);

  const renderName = (id: string) => {
    const p = byId(id);
    if (!p) return 'Unknown';
    if (onOpenPerson) {
      return (
        <button
          type="button"
          onClick={() => onOpenPerson(id)}
          className="font-semibold text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
        >
          {fullName(p)}
        </button>
      );
    }
    return <span className="font-semibold text-slate-700">{fullName(p)}</span>;
  };

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
    >
      <option value="">Select person…</option>
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {fullName(p)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm space-y-5">
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Relationship Calculator</p>
        <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">How are they related?</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-3xl">
          Pick two people to derive their genealogical relationship (parent, cousin with degree + removed, …) and the
          path between them. Pure logic in <code className="text-slate-600">lib/relationshipCalculator.ts</code>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr,auto,1fr] sm:items-center">
        {select(aId, setAId)}
        <ArrowRight className="mx-auto hidden h-4 w-4 text-slate-400 sm:block" />
        {select(bId, setBId)}
      </div>

      {a && b ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          {!result ? (
            <p className="text-sm text-slate-600">
              {renderName(a.id)} and {renderName(b.id)} are not known to be blood relatives.
            </p>
          ) : result.kind === 'self' ? (
            <p className="text-sm text-slate-600">
              {renderName(a.id)} and {renderName(b.id)} are the same person.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                {renderName(b.id)} is <span className="font-bold text-slate-900">{result.label}</span> of {renderName(a.id)}.
              </p>
              {result.commonAncestorIds.length > 0 && (
                <p className="text-xs text-slate-500">
                  Closest common ancestor: {result.commonAncestorIds.map(renderName)}.
                </p>
              )}
              {result.pathPersonIds.length > 1 && (
                <p className="text-xs leading-relaxed text-slate-500">
                  Path: {result.pathPersonIds.map((id, i) => (
                    <React.Fragment key={`${id}-${i}`}>
                      {i > 0 && <span className="mx-1 text-slate-400">→</span>}
                      {renderName(id)}
                    </React.Fragment>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default RelationshipCalculator;
