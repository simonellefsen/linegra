import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Library, Link, Trash2, Plus, Merge, X, Search, ExternalLink, Sparkles } from 'lucide-react';
import DetailEdit from './DetailEdit';
import { SOURCE_TYPES } from './constants';
import { Citation, Source, Quay } from '../../types';
import { listTreeSources, mergeSources } from '../../services/archive';
import { QUAY_VALUES, QUAY_LABELS } from '../../lib/sourceQuality';

interface SourcesTabProps {
  canEdit: boolean;
  sources: Source[];
  citations: Citation[];
  availableEvents: string[];
  treeId: string;
  actor: { id?: string | null; name?: string | null };
  onAddSource: () => void;
  onUpdateSource: (id: string, updates: Partial<Source>) => void;
  onRemoveSource: (id: string) => void;
  onAddCitation: (sourceId: string, eventLabel?: string) => void;
  onUpdateCitation: (id: string, updates: Partial<Citation>) => void;
  onRemoveCitation: (id: string) => void;
  onCiteExisting: (source: Source, eventLabel: string) => void;
  onRefresh?: () => void | Promise<void>;
  citationMap: Record<string, Citation[]>;
  aiAvailable: boolean;
  onTranscribe: (sourceId: string, imageDataUrl: string) => Promise<void>;
}

const normalizeTitle = (title?: string) => (title || '').trim().toLowerCase();

// "New Source Record" was the old blank-slate default for freshly created sources; treat it as
// untitled so a card falls back to a more descriptive name (abbreviation, then type) instead of
// showing that meaningless placeholder as the heading.
const realTitle = (source: Source) => {
  const raw = (source.title || '').trim();
  return raw && raw.toLowerCase() !== 'new source record' ? raw : '';
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

// Editable URL field that is also openable in a new tab. The input stays editable (type/paste a
// link); a trailing external-link icon opens it whenever a usable URL is present, even for viewers
// who can't edit the source.
const UrlField: React.FC<{
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const trimmed = (value || '').trim();
  const href = trimmed ? (isHttpUrl(trimmed) ? trimmed : `https://${trimmed}`) : '';
  const openable = !!href;
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">URL / Link</label>
      <div className="relative">
        <input
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          disabled={disabled}
          readOnly={disabled}
          className={`w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all shadow-sm ${
            disabled ? 'opacity-70 cursor-not-allowed bg-slate-50' : ''
          }`}
        />
        <a
          href={openable ? href : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link in new tab"
          tabIndex={openable ? 0 : -1}
          onClick={(event) => {
            if (!openable) event.preventDefault();
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 transition-colors ${
            openable ? 'text-blue-600 hover:text-blue-700' : 'text-slate-300 pointer-events-none'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};

const SourcesTab: React.FC<SourcesTabProps> = ({
  canEdit,
  sources,
  availableEvents,
  treeId,
  actor,
  onAddSource,
  onUpdateSource,
  onRemoveSource,
  onAddCitation,
  onUpdateCitation,
  onRemoveCitation,
  onCiteExisting,
  onRefresh,
  citationMap,
  aiAvailable,
  onTranscribe,
}) => {
  const readOnly = !canEdit;
  const [library, setLibrary] = useState<Source[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerEvent, setPickerEvent] = useState('General');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Tree-wide source library (for "Cite Existing" + duplicate detection).
  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    listTreeSources(treeId)
      .then((rows) => {
        if (!cancelled) setLibrary(rows);
      })
      .catch(() => {
        if (!cancelled) setLibrary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  // Sources in the tree that share a title — candidates for the merge tool.
  const duplicateGroups = useMemo(() => {
    const groups: Record<string, Source[]> = {};
    library.forEach((source) => {
      const key = normalizeTitle(source.title);
      if (!key) return;
      (groups[key] || (groups[key] = [])).push(source);
    });
    return Object.values(groups).filter((group) => group.length > 1);
  }, [library]);

  const handleMerge = async (canonicalId: string, others: Source[]) => {
    if (!treeId) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeSources(
        treeId,
        canonicalId,
        others.map((s) => s.id),
        { id: actor.id ?? null, name: actor.name ?? null }
      );
      await onRefresh?.();
      setMergeOpen(false);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed.');
    } finally {
      setMerging(false);
    }
  };

  const filteredLibrary = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (s) =>
        normalizeTitle(s.title).includes(q) ||
        normalizeTitle(s.abbreviation).includes(q) ||
        normalizeTitle(s.type).includes(q)
    );
  }, [library, pickerQuery]);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Documentary Evidence</p>
        <div className="flex items-center gap-4">
          {duplicateGroups.length > 0 && (
            <button
              onClick={() => setMergeOpen(true)}
              disabled={readOnly}
              className="text-[9px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Merge className="w-4 h-4" /> Merge Duplicates ({duplicateGroups.length})
            </button>
          )}
          <button
            onClick={() => {
              setPickerOpen(true);
              setPickerQuery('');
            }}
            disabled={readOnly}
            className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Link className="w-4 h-4" /> Cite Existing
          </button>
          <button
            onClick={onAddSource}
            disabled={readOnly}
            className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Library className="w-4 h-4" /> New Source
          </button>
        </div>
      </div>

      {/* Merge duplicates panel */}
      {mergeOpen && (
        <div className="p-6 bg-amber-50/60 border border-amber-200 rounded-[28px] space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-amber-700 uppercase tracking-[0.2em]">Merge duplicate sources</p>
            <button onClick={() => setMergeOpen(false)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            These sources share a title. Pick the canonical record — the others are deleted and their citations repointed to it.
          </p>
          {mergeError && <p className="text-xs text-rose-500">{mergeError}</p>}
          {duplicateGroups.map((group) => (
            <DuplicateGroup key={normalizeTitle(group[0].title)} group={group} onMerge={handleMerge} merging={merging} />
          ))}
        </div>
      )}

      {/* Cite existing source picker */}
      {pickerOpen && (
        <div className="p-6 bg-emerald-50/60 border border-emerald-200 rounded-[28px] space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-[0.2em]">Cite an existing source</p>
            <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search the tree's sources…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <select
              value={pickerEvent}
              onChange={(e) => setPickerEvent(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {availableEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {filteredLibrary.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-6">No sources found.</p>
            )}
            {filteredLibrary.map((source) => (
              <button
                key={source.id}
                onClick={() => {
                  onCiteExisting(source, pickerEvent);
                  setPickerOpen(false);
                }}
                className="w-full text-left p-3 bg-white border border-slate-200 rounded-2xl hover:border-emerald-300 hover:bg-emerald-50/40 transition flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{source.title || 'Untitled Record'}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">{source.type}{source.abbreviation ? ` · ${source.abbreviation}` : ''}</p>
                </div>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Cite for {pickerEvent}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {sources.map((source) => {
          const citationKey = source.externalId || source.id;
          const linkedCitations = citationKey ? citationMap[citationKey] || [] : [];
          const headingValue = realTitle(source) || source.abbreviation || source.type || '';
          const showAbbreviationLine = !!source.abbreviation && headingValue !== source.abbreviation;

          return (
            <div key={source.id} className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm transition-all hover:shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <select
                    value={source.type}
                    onChange={(e) => onUpdateSource(source.id, { type: e.target.value as Source['type'] })}
                    disabled={readOnly}
                    className="px-2 py-0.5 bg-slate-900 text-white text-[9px] font-black uppercase rounded-lg border-none outline-none cursor-pointer disabled:opacity-50"
                  >
                    {SOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {linkedCitations.length} {linkedCitations.length === 1 ? 'citation' : 'citations'}
                  </span>
                </div>
                <button onClick={() => onRemoveSource(source.id)} className="text-slate-300 hover:text-rose-500 disabled:opacity-40" disabled={readOnly}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                value={headingValue}
                onChange={(e) => onUpdateSource(source.id, { title: e.target.value })}
                disabled={readOnly}
                className="w-full font-bold text-slate-900 border-none outline-none bg-transparent text-lg font-serif disabled:opacity-60"
                placeholder="Record Title..."
              />
              {showAbbreviationLine && <p className="text-xs text-slate-500 italic">{source.abbreviation}</p>}
              <div className="grid grid-cols-2 gap-3">
                <DetailEdit label="Citation Date" value={source.citationDate} onChange={(v) => onUpdateSource(source.id, { citationDate: v })} disabled={readOnly} />
                <UrlField value={source.url} onChange={(v) => onUpdateSource(source.id, { url: v })} disabled={readOnly} />
                <DetailEdit label="Short Title / Abbreviation" value={source.abbreviation || ''} onChange={(v) => onUpdateSource(source.id, { abbreviation: v })} disabled={readOnly} />
                <DetailEdit label="Call Number" value={source.callNumber || ''} onChange={(v) => onUpdateSource(source.id, { callNumber: v })} disabled={readOnly} />
              </div>
              <TranscriptionField
                value={source.actualText || ''}
                onChange={(v) => onUpdateSource(source.id, { actualText: v })}
                disabled={readOnly}
                aiAvailable={aiAvailable}
                onTranscribe={(imageDataUrl) => onTranscribe(source.id, imageDataUrl)}
              />

              {/* Citations (events this source documents for this person) */}
              <div className="space-y-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cited for (events)</p>
                  {!readOnly && (
                    <button
                      onClick={() => onAddCitation(citationKey)}
                      className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 hover:translate-x-1 transition-transform"
                    >
                      <Plus className="w-3 h-3" /> Add Citation
                    </button>
                  )}
                </div>
                {linkedCitations.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Not yet cited for an event on this person.</p>
                ) : (
                  linkedCitations.map((citation) => (
                    <div key={citation.id} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Link className="w-3 h-3 text-blue-500" />
                          <select
                            value={citation.eventLabel || 'General'}
                            onChange={(e) => onUpdateCitation(citation.id, { eventLabel: e.target.value })}
                            disabled={readOnly}
                            className="bg-transparent text-[11px] text-blue-600 font-black uppercase tracking-widest border-none outline-none cursor-pointer disabled:opacity-50"
                          >
                            {availableEvents.map((ev) => (
                              <option key={ev} value={ev}>
                                {ev}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => onRemoveCitation(citation.id)} className="text-slate-300 hover:text-rose-500 disabled:opacity-40" disabled={readOnly}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <DetailEdit label="Page / Reference" value={citation.page || ''} onChange={(v) => onUpdateCitation(citation.id, { page: v })} disabled={readOnly} />
                        <DetailEdit label="Record Date" value={citation.dataDate || ''} onChange={(v) => onUpdateCitation(citation.id, { dataDate: v })} disabled={readOnly} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] shrink-0">Certainty</label>
                        <select
                          value={citation.quay != null ? String(citation.quay) : ''}
                          onChange={(e) =>
                            onUpdateCitation(citation.id, {
                              quay: e.target.value === '' ? undefined : (Number(e.target.value) as Quay),
                              quality: e.target.value === '' ? undefined : e.target.value,
                            })
                          }
                          disabled={readOnly}
                          className="text-[11px] text-slate-700 border border-slate-100 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-100 bg-white disabled:opacity-50"
                          title="GEDCOM QUAY — source-citation certainty"
                        >
                          <option value="">Not rated</option>
                          {QUAY_VALUES.map((q) => (
                            <option key={q} value={String(q)}>{q} · {QUAY_LABELS[q]}</option>
                          ))}
                        </select>
                      </div>
                      {citation.dataText && !readOnly ? (
                        <textarea
                          value={citation.dataText}
                          onChange={(e) => onUpdateCitation(citation.id, { dataText: e.target.value })}
                          placeholder="Excerpt / data text…"
                          className="w-full text-[11px] text-slate-500 border border-slate-100 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-100 min-h-[44px]"
                        />
                      ) : (
                        citation.dataText && <p className="whitespace-pre-line text-[11px] text-slate-500">{citation.dataText}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
        {sources.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No source documents linked to this profile.</p>}
      </div>
    </div>
  );
};

/** One duplicate-title group: choose a canonical, merge the rest into it. */
const DuplicateGroup: React.FC<{
  group: Source[];
  onMerge: (canonicalId: string, others: Source[]) => Promise<void>;
  merging: boolean;
}> = ({ group, onMerge, merging }) => {
  const [canonicalId, setCanonicalId] = useState(group[0].id);
  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-4 space-y-2">
      <p className="text-sm font-bold text-slate-800">{group[0].title}</p>
      {group.map((source) => (
        <label key={source.id} className="flex items-center gap-2 text-xs text-slate-600">
          <input type="radio" name={`dup-${normalizeTitle(group[0].title)}`} checked={canonicalId === source.id} onChange={() => setCanonicalId(source.id)} disabled={merging} />
          <span className="font-medium">{source.abbreviation || source.type}</span>
          <span className="text-slate-300">·</span>
          <span className="text-[10px] text-slate-400">{source.id.slice(0, 8)}</span>
        </label>
      ))}
      <button
        onClick={() => onMerge(canonicalId, group.filter((s) => s.id !== canonicalId))}
        disabled={merging}
        className="mt-1 px-3 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-700 disabled:opacity-50"
      >
        {merging ? 'Merging…' : `Merge ${group.length - 1} into canonical`}
      </button>
    </div>
  );
};

// Read an image File, downscale it to a reasonable size, and return a JPEG data URL. Keeps the
// payload sent to the vision model small (a full parish-register scan can be many MB). Falls back to
// the raw data URL if a canvas isn't available.
const downscaleImage = (file: File, maxDim = 1600, quality = 0.85): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file of the record page.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const sourceUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(sourceUrl);
        }
      };
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.src = sourceUrl;
    };
    reader.readAsDataURL(file);
  });

/** Editable transcription area with an "AI Transcribe" control that reads a scanned page image. */
const TranscriptionField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  aiAvailable: boolean;
  onTranscribe: (imageDataUrl: string) => Promise<void>;
}> = ({ value, onChange, disabled, aiAvailable, onTranscribe }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (file?: File | null) => {
    if (!file || busy) return;
    setError(null);
    try {
      const dataUrl = await downscaleImage(file);
      setPreview(dataUrl);
      setBusy(true);
      await onTranscribe(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Transcription</label>
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!aiAvailable || busy}
            title={!aiAvailable ? 'Configure AI in Administrator → Database' : 'Transcribe a scanned page image with AI'}
            className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 hover:translate-x-1 transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
          >
            <Sparkles className="w-3 h-3" /> {busy ? 'Transcribing…' : 'AI Transcribe'}
          </button>
        )}
      </div>
      {preview && (
        <div className="rounded-xl overflow-hidden border border-slate-100">
          <img src={preview} alt="Record page" className="w-full max-h-40 object-cover" />
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full text-xs text-slate-500 italic border-none outline-none bg-slate-50 rounded-xl p-3 min-h-[60px] disabled:opacity-60"
        placeholder={busy ? 'Transcribing the page…' : 'Transcription of the record contents…'}
      />
      {error && <p className="text-xs text-rose-500 px-1">{error}</p>}
      {!disabled && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void handleFile(file);
          }}
        />
      )}
    </div>
  );
};

export default SourcesTab;
