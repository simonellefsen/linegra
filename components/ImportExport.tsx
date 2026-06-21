import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Wifi
} from 'lucide-react';
import { Person, Relationship } from '../types';
import { parseGedcom, serializeGedcom } from '../lib/gedcomParser';

interface ImportExportProps {
  people: Person[];
  relationships: Relationship[];
  onImport: (data: { people: Person[]; relationships: Relationship[] }) => void;
  activeTreeName?: string;
  showGedcomSection?: boolean;
}

const ImportExport: React.FC<ImportExportProps> = ({
  people,
  relationships,
  onImport,
  activeTreeName,
  showGedcomSection = true
}) => {
  const LARGE_IMPORT_THRESHOLD = 250;
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importStats, setImportStats] = useState({ people: 0, relationships: 0 });
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<{ data: { people: Person[]; relationships: Relationship[] }; fileName: string } | null>(null);
  const [showProgressBanner, setShowProgressBanner] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const beginProgress = () => {
    setShowProgressBanner(true);
    setProgressValue(5);
    clearProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      setProgressValue((prev) => {
        const next = prev + Math.random() * 8;
        return next >= 92 ? 92 : next;
      });
    }, 700);
  };

  const finishProgress = () => {
    clearProgressInterval();
    setProgressValue(100);
    setTimeout(() => {
      setShowProgressBanner(false);
      setProgressValue(0);
    }, 1200);
  };

  useEffect(() => {
    return () => {
      clearProgressInterval();
    };
  }, []);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus('idle');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = parseGedcom(text);
        
        setImportStats({ people: data.people.length, relationships: data.relationships.length });
        setImportWarnings(data.warnings);
        setPendingImport({ data, fileName: file.name });
        setStatus('idle');
        setIsImporting(false);
        return;
      } catch (err) {
        console.error("Import failed", err);
        setStatus('error');
        setImportWarnings(['Import failed, see console for details.']);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleExportGEDCOM = () => {
    const ged = serializeGedcom(people, relationships);

    const blob = new Blob([ged], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linegra_export_${new Date().toISOString().slice(0,10)}.ged`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20 animate-in fade-in duration-500">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".ged,.txt" 
        className="hidden" 
      />

      {showGedcomSection && showProgressBanner && (
        <div className="p-5 rounded-[32px] border border-slate-200 bg-white shadow-sm flex flex-col gap-3 animate-in fade-in duration-500">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Importing {importStats.people} individuals / {importStats.relationships} links</span>
            <span>{Math.round(progressValue)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all duration-300"
              style={{ width: `${Math.min(progressValue, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Large archives can take a moment while we sync every record into Supabase.
          </p>
        </div>
      )}

      {showGedcomSection && (
        <div className="p-8 rounded-[40px] border-2 bg-white border-emerald-100 shadow-emerald-100/20 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex gap-5">
              <div className="w-16 h-16 rounded-[22px] flex items-center justify-center shadow-lg bg-emerald-500 text-white">
                <Wifi className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-serif font-bold text-slate-900">Archive Synchronized</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700">
                    Real-time
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
                  {activeTreeName
                    ? `All GEDCOM imports flow directly into the "${activeTreeName}" Supabase tree.`
                    : 'Select a family tree to enable Supabase-backed imports.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGedcomSection && (
        <>
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-[32px] space-y-4">
        <div className="flex items-center justify-between text-amber-700">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" />
            GEDCOM import warnings ({importWarnings.length})
          </div>
          <button
            disabled={!importWarnings.length}
            onClick={() => {
              if (!importWarnings.length) return;
              const log = [`Linegra GEDCOM import log - ${new Date().toISOString()}`, '', ...importWarnings].join('\n');
              const blob = new Blob([log], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `linegra_gedcom_warnings_${new Date().toISOString().slice(0,10)}.txt`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
            className={`text-xs font-bold underline ${importWarnings.length ? 'hover:text-amber-800' : 'opacity-50 cursor-not-allowed'}`}
          >
            Download log
          </button>
        </div>
        {importWarnings.length > 0 ? (
          <ul className="list-disc ml-6 text-xs text-amber-800 space-y-1 max-h-48 overflow-auto pr-2">
            {importWarnings.map((warning, idx) => (
              <li key={`${warning}-${idx}`}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-700">No warnings recorded yet. Import a GEDCOM to see ignored fields or issues.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="group bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Upload className="w-7 h-7" />
          </div>
          <h4 className="text-xl font-serif font-bold text-slate-900">GEDCOM Ingestion</h4>
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Import INDI, FAM, and relationships from GEDCOM files — both legacy 5.x and the new GEDCOM 7.x standard.</p>
          <button 
            disabled={isImporting}
            className="w-full py-4 bg-slate-50 border border-slate-100 text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Choose GEDCOM File"}
          </button>
        </div>

        <div className="group bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Download className="w-7 h-7" />
          </div>
          <h4 className="text-xl font-serif font-bold text-slate-900">Universal Export</h4>
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Preserve your research offline as a modern <strong>GEDCOM 7.0</strong> archive (UTF-8, FamilySearch GEDCOM 7).</p>
          <button 
            onClick={handleExportGEDCOM}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            Download Archive
          </button>
        </div>
      </div>

      {status === 'success' && (
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-emerald-900 font-bold leading-none">Import Successful</p>
            <p className="text-xs text-emerald-600 mt-1">
              Parsed {importStats.people} individuals and {importStats.relationships} relationship mappings.
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-3xl flex items-center gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-sm text-rose-900 font-bold leading-none">Import Failed</p>
            <p className="text-xs text-rose-600 mt-1">The GEDCOM file could not be parsed. Ensure it is a valid format.</p>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Confirm Import</p>
              <h3 className="text-2xl font-serif font-bold text-slate-900 mt-2">Attach GEDCOM to {activeTreeName || 'current tree'}?</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              You are about to ingest <span className="font-bold text-slate-900">{importStats.people}</span> people and <span className="font-bold text-slate-900">{importStats.relationships}</span> relationships from <span className="font-semibold">{pendingImport.fileName}</span> into <span className="font-semibold">{activeTreeName || 'this tree'}</span>.
            </p>
            {!!importWarnings.length && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 space-y-2 max-h-32 overflow-auto">
                <p className="font-semibold">Warnings</p>
                <ul className="list-disc ml-5 space-y-1">
                  {importWarnings.map((warning, idx) => (
                    <li key={`${warning}-${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setPendingImport(null);
                  setStatus('idle');
                }}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!pendingImport) return;
                  const importPayload = pendingImport;
                  const requiresProgress = importStats.people >= LARGE_IMPORT_THRESHOLD || importStats.relationships >= LARGE_IMPORT_THRESHOLD;
                  if (requiresProgress) beginProgress();
                  setIsImporting(true);
                  setPendingImport(null);
                  try {
                    await onImport(importPayload.data);
                    setStatus('success');
                  } catch (err) {
                    console.error('Confirm import failed', err);
                    setStatus('error');
                  } finally {
                    if (requiresProgress) finishProgress();
                    setIsImporting(false);
                  }
                }}
                className="flex-1 px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default ImportExport;
