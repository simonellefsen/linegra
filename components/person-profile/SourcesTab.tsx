import React from 'react';
import { Library, Link, Trash2 } from 'lucide-react';
import DetailEdit from './DetailEdit';
import { SOURCE_TYPES } from './constants';
import { Citation, Source } from '../../types';

interface SourcesTabProps {
  sources: Source[];
  availableEvents: string[];
  onAddSource: () => void;
  onUpdateSource: (id: string, updates: Partial<Source>) => void;
  onRemoveSource: (id: string) => void;
  citationMap: Record<string, Citation[]>;
}

const SourcesTab: React.FC<SourcesTabProps> = ({
  sources,
  availableEvents,
  onAddSource,
  onUpdateSource,
  onRemoveSource,
  citationMap,
}) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Documentary Evidence</p>
      <button
        onClick={onAddSource}
        className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all"
      >
        <Library className="w-4 h-4" /> Add Record
      </button>
    </div>

    <div className="space-y-6">
      {sources.map((source) => {
        const citationKey = source.externalId || source.id;
        const linkedCitations = citationKey ? citationMap[citationKey] || [] : [];

        return (
          <div key={source.id} className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <select
                  value={source.type}
                  onChange={(e) => onUpdateSource(source.id, { type: e.target.value as Source['type'] })}
                  className="px-2 py-0.5 bg-slate-900 text-white text-[9px] font-black uppercase rounded-lg border-none outline-none cursor-pointer"
                >
                  {SOURCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-100/50 rounded-lg">
                  <Link className="w-2.5 h-2.5 text-blue-600" />
                  <select
                    value={source.event || 'General'}
                    onChange={(e) => onUpdateSource(source.id, { event: e.target.value })}
                    className="bg-transparent text-[10px] text-blue-600 font-black uppercase tracking-widest border-none outline-none cursor-pointer"
                  >
                    {availableEvents.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={() => onRemoveSource(source.id)} className="text-slate-300 hover:text-rose-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              value={source.title || source.abbreviation || source.externalId || ''}
              onChange={(e) => onUpdateSource(source.id, { title: e.target.value })}
              className="w-full font-bold text-slate-900 border-none outline-none bg-transparent text-lg font-serif"
              placeholder="Record Title..."
            />
            {source.abbreviation && <p className="text-xs text-slate-500 italic">{source.abbreviation}</p>}
            <div className="grid grid-cols-2 gap-3">
              <DetailEdit label="Citation Date" value={source.citationDate} onChange={(v) => onUpdateSource(source.id, { citationDate: v })} />
              <DetailEdit label="URL / Link" value={source.url} onChange={(v) => onUpdateSource(source.id, { url: v })} />
              <DetailEdit
                label="Short Title / Abbreviation"
                value={source.abbreviation || ''}
                onChange={(v) => onUpdateSource(source.id, { abbreviation: v })}
              />
              <DetailEdit label="Call Number" value={source.callNumber || ''} onChange={(v) => onUpdateSource(source.id, { callNumber: v })} />
            </div>
            <textarea
              value={source.actualText || ''}
              onChange={(e) => onUpdateSource(source.id, { actualText: e.target.value })}
              className="w-full text-xs text-slate-500 italic border-none outline-none bg-slate-50 rounded-xl p-3 min-h-[60px]"
              placeholder="Transcription of the record contents..."
            />
            {linkedCitations.length > 0 && (
              <div className="space-y-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                {linkedCitations.map((citation) => (
                  <div key={citation.id} className="text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800 flex items-center gap-2">
                      <Library className="w-3 h-3 text-slate-500" />
                      {(citation.eventLabel || 'General')}{citation.dataDate ? ` • ${citation.dataDate}` : ''}
                    </p>
                    {citation.page && <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Page {citation.page}</p>}
                    {citation.dataText && <p className="whitespace-pre-line text-slate-500">{citation.dataText}</p>}
                    {citation.quality && (
                      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Quality: {citation.quality}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {sources.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No source documents linked to this profile.</p>}
    </div>
  </div>
);

export default SourcesTab;
