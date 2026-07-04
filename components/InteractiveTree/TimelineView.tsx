import React, { useMemo } from 'react';
import type { Person } from '../../types';
import { collectTimelineEntries, timelineYearRange, type TimelineEntryKind } from '../../lib/timelineEvents';

interface TimelineViewProps {
  people: Person[];
  focusId?: string;
  selectedPersonId?: string;
  onPersonSelect: (person: Person) => void;
}

const KIND_COLOR: Record<TimelineEntryKind, string> = {
  birth: 'bg-sky-500',
  death: 'bg-slate-700',
  burial: 'bg-slate-500',
  event: 'bg-violet-500',
  marriage: 'bg-rose-500',
};

const TimelineView: React.FC<TimelineViewProps> = ({
  people,
  focusId,
  selectedPersonId,
  onPersonSelect,
}) => {
  const entries = useMemo(() => collectTimelineEntries(people), [people]);
  const range = useMemo(() => timelineYearRange(entries), [entries]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  if (!entries.length) {
    return (
      <div
        data-tree-export-root
        className="w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] flex items-center justify-center text-slate-500"
      >
        No dated events in the current tree scope.
      </div>
    );
  }

  const minYear = range?.min ?? entries[0]?.year ?? 1800;
  const maxYear = range?.max ?? entries[entries.length - 1]?.year ?? minYear + 1;
  const span = Math.max(maxYear - minYear, 1);

  const positionForYear = (year: number | null) => {
    if (year == null) return 100;
    return ((year - minYear) / span) * 100;
  };

  return (
    <div
      data-tree-export-root
      className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner"
    >
      <div className="absolute top-3 left-3 z-10 rounded-2xl bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
        Timeline · {entries.length} events
        {range ? ` · ${range.min}–${range.max}` : ''}
      </div>
      <div className="h-full overflow-auto p-8 pt-14">
        <div className="relative min-w-[720px] pb-8">
          <div className="relative h-1 bg-slate-300 rounded-full mx-4">
            <span className="absolute -top-6 left-0 text-[10px] font-bold text-slate-500">{minYear}</span>
            <span className="absolute -top-6 right-0 text-[10px] font-bold text-slate-500">{maxYear}</span>
          </div>
          <div className="relative mt-10 space-y-3">
            {entries.map((entry, index) => {
              const person = peopleById.get(entry.personId);
              const left = positionForYear(entry.year);
              const isFocus = entry.personId === focusId;
              const isSelected = entry.personId === selectedPersonId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!person}
                  onClick={() => person && onPersonSelect(person)}
                  className={[
                    'absolute w-[min(240px,42vw)] text-left rounded-2xl border bg-white px-3 py-2 shadow-sm transition-all hover:shadow-md',
                    isSelected ? 'ring-2 ring-blue-300 border-blue-200' : 'border-slate-200',
                    isFocus ? 'border-sky-300' : '',
                  ].join(' ')}
                  style={{
                    left: `${Math.min(Math.max(left, 2), 78)}%`,
                    top: `${(index % 8) * 72}px`,
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${KIND_COLOR[entry.kind]}`} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {entry.year ?? 'Undated'} · {entry.label}
                      </p>
                      <p className="text-sm font-bold text-slate-900 truncate">{entry.personName}</p>
                      {entry.dateRaw && (
                        <p className="text-[11px] text-slate-500 truncate">{entry.dateRaw}</p>
                      )}
                      {entry.placeLabel && (
                        <p className="text-[10px] text-slate-400 truncate">{entry.placeLabel}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ height: `${Math.ceil(entries.length / 8) * 72 + 80}px` }} />
        </div>
      </div>
      <svg className="pointer-events-none absolute inset-0 w-full h-full opacity-0" aria-hidden="true">
        <rect width="100%" height="100%" fill="#f8fafc" />
      </svg>
    </div>
  );
};

export default TimelineView;
