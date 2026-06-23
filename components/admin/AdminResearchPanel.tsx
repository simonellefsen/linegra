import React, { useMemo } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Person, Relationship } from '../../types';
import { runDataQualityChecks, DataQualityIssue, DataQualityIssueType, DataQualitySeverity } from '../../lib/dataQuality';

interface AdminResearchPanelProps {
  treeId: string | null;
  people: Person[];
  relationships: Relationship[];
  onOpenPerson?: (personId: string) => void;
}

const TYPE_LABEL: Record<DataQualityIssueType, string> = {
  'death-before-birth': 'Death before birth',
  'burial-before-death': 'Burial before death',
  'implausible-lifespan': 'Implausible lifespan',
  'parent-younger-than-child': 'Parent not older than child',
  'implausibly-young-parent': 'Implausibly young parent',
  'child-after-parent-death': 'Child born after parent death',
  'duplicate-person': 'Possible duplicate',
};

const SEVERITY_BADGE: Record<DataQualitySeverity, string> = {
  error: 'bg-rose-100 text-rose-700',
  warning: 'bg-amber-100 text-amber-700',
};

/**
 * Administrator → Research: runs the pure data-quality engine (lib/dataQuality.ts) over the active
 * tree and lists likely genealogy errors (impossible dates, parent/child inconsistencies, possible
 * duplicates). Read-only for now — dismiss/convert-to-note is a follow-up. Roadmap item O.
 */
const AdminResearchPanel: React.FC<AdminResearchPanelProps> = ({ treeId, people, relationships, onOpenPerson }) => {
  const issues = useMemo(() => runDataQualityChecks(people, relationships), [people, relationships]);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (!treeId) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white p-12 text-center shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-slate-900">No Active Tree</h2>
        <p className="mt-2 text-slate-500">Choose a family tree to review research issues.</p>
      </div>
    );
  }

  const renderIssue = (issue: DataQualityIssue) => (
    <li
      key={issue.id}
      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
    >
      <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] ${SEVERITY_BADGE[issue.severity]}`}>
        {issue.severity === 'error' ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {issue.severity}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{TYPE_LABEL[issue.type]}</p>
        <p className="text-sm text-slate-700">{issue.message}</p>
      </div>
      {onOpenPerson && issue.personIds[0] ? (
        <button
          type="button"
          onClick={() => onOpenPerson(issue.personIds[0])}
          className="shrink-0 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900"
        >
          Open
        </button>
      ) : null}
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm space-y-5">
        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Research Issues</p>
          <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Data-Quality Review</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl">
            A consistency pass over this tree — impossible dates, parent/child inconsistencies, and possible
            duplicates. Pure checks in <code className="text-slate-600">lib/dataQuality.ts</code>; re-runs live as
            you edit the tree.
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-emerald-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold">No issues detected across {people.length} people.</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 font-bold text-rose-700">
                <AlertCircle className="h-4 w-4" /> {errors.length} error{errors.length === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-bold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {errors.map(renderIssue)}
              {warnings.map(renderIssue)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminResearchPanel;
