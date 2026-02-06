import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Key, 
  Globe,
  Settings2,
  Wifi,
  WifiOff,
  ChevronRight,
  Info
} from 'lucide-react';
import { Person, Relationship, PersonEvent, Source } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';

interface ImportExportProps {
  people: Person[];
  relationships: Relationship[];
  onImport: (data: { people: Person[]; relationships: Relationship[] }) => void;
}

type ParsedPerson = Partial<Person> & {
  events?: PersonEvent[];
  sourceIds?: string[];
  inlineSources?: Source[];
};

const GEDCOM_EVENT_MAP: Record<string, PersonEvent['type']> = {
  RESI: 'Residence',
  OCCU: 'Occupation',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  NATU: 'Naturalization',
  MILI: 'Military Service',
  EDUC: 'Education',
  BAPM: 'Baptism',
  CONF: 'Confirmation',
  EVEN: 'Other'
};

const ImportExport: React.FC<ImportExportProps> = ({ people, relationships, onImport }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importStats, setImportStats] = useState({ people: 0, relationships: 0 });
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [showConfig, setShowConfig] = useState(!isSupabaseConfigured());
  const [tempUrl, setTempUrl] = useState('');
  const [tempKey, setTempKey] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLive = isSupabaseConfigured();

  const handleSaveConfig = () => {
    if (tempUrl && tempKey) {
      localStorage.setItem('LINEGRA_SUPABASE_URL', tempUrl);
      localStorage.setItem('LINEGRA_SUPABASE_ANON_KEY', tempKey);
      window.location.reload(); 
    }
  };

  const parseGEDCOM = (text: string) => {
    const lines = text.split(/\r?\n/);
    const parsedPeople: Record<string, ParsedPerson> = {};
    const parsedFamilies: Record<string, { husb?: string; wife?: string; children: string[]; date?: string; place?: string; type?: string }> = {};
    const parsedSources: Record<string, Source> = {};
    const warnings: string[] = [];
    
    let currentId = '';
    let currentType: 'INDI' | 'FAM' | 'SOUR' | null = null;
    let currentTag = '';
    let currentEvent: PersonEvent | null = null;
    const supportedIndividualTags = new Set(['NAME', 'SEX', 'BIRT', 'DEAT', 'SOUR', ...Object.keys(GEDCOM_EVENT_MAP)]);
    const supportedFamilyTags = new Set(['HUSB', 'WIFE', 'CHIL', 'MARR']);

    lines.forEach((line) => {
      const match = line.match(/^(\d+)\s+(@?\w+@?)\s*(\w+)?\s*(.*)$/);
      if (!match) return;

      const [, levelStr, tagOrId, tagIfId, value] = match;
      const level = parseInt(levelStr);

      if (level === 0) {
        currentEvent = null;
        if (tagIfId === 'INDI') {
          currentId = tagOrId.replace(/@/g, '');
          currentType = 'INDI';
          parsedPeople[currentId] = { id: currentId, firstName: '', lastName: '', updatedAt: new Date().toISOString(), events: [], sourceIds: [], inlineSources: [] };
        } else if (tagIfId === 'FAM') {
          currentId = tagOrId.replace(/@/g, '');
          currentType = 'FAM';
          parsedFamilies[currentId] = { children: [] };
        } else if (tagIfId === 'SOUR') {
          currentId = tagOrId.replace(/@/g, '');
          currentType = 'SOUR';
          parsedSources[currentId] = {
            id: currentId,
            title: '',
            type: 'Unknown',
            reliability: 1,
            actualText: ''
          };
        } else {
          currentType = null;
        }
      } else if (currentType === 'INDI' && parsedPeople[currentId]) {
        const p = parsedPeople[currentId];
        if (level === 1 && tagOrId !== 'DATE' && tagOrId !== 'PLAC' && tagOrId !== 'NOTE') {
          currentEvent = null;
          currentTag = '';
        }
        const ensureEvent = (type: PersonEvent['type'], idSuffix: string) => {
          const events = p.events || (p.events = []);
          let evt = events.find((event) => event.id === `evt-${currentId}-${idSuffix}`);
          if (!evt) {
            evt = {
              id: `evt-${currentId}-${idSuffix}`,
              type,
              date: '',
              place: '',
              description: ''
            };
            events.push(evt);
          }
          return evt;
        };
        if (tagOrId === 'NAME') {
          const nameParts = value.split('/');
          p.firstName = nameParts[0]?.trim() || '';
          p.lastName = nameParts[1]?.trim() || '';
        } else if (tagOrId === 'SEX') {
          p.gender = value.trim() === 'F' ? 'F' : (value.trim() === 'M' ? 'M' : 'O');
        } else if (tagOrId === 'BIRT') {
          currentTag = 'BIRT';
          currentEvent = ensureEvent('Birth', 'birth');
        } else if (tagOrId === 'DEAT') {
          currentTag = 'DEAT';
          currentEvent = ensureEvent('Death', 'death');
        } else if (tagOrId === 'CHAN') {
          currentTag = 'CHAN';
        } else if (GEDCOM_EVENT_MAP[tagOrId]) {
          currentTag = tagOrId;
          const events = p.events || (p.events = []);
          currentEvent = {
            id: `evt-${currentId}-${events.length + 1}`,
            type: GEDCOM_EVENT_MAP[tagOrId],
            date: '',
            place: '',
            description: value.trim()
          };
          events.push(currentEvent);
        } else if (tagOrId === 'DATE' && level === 2) {
          if (currentTag === 'BIRT') p.birthDate = value.trim();
          if (currentTag === 'DEAT') p.deathDate = value.trim();
          if (currentEvent) currentEvent.date = value.trim();
          if (currentTag === 'CHAN') {
            const parsed = Date.parse(value.trim());
            p.updatedAt = Number.isNaN(parsed) ? value.trim() : new Date(parsed).toISOString();
          }
        } else if (tagOrId === 'PLAC' && level === 2) {
          if (currentTag === 'BIRT') p.birthPlace = value.trim();
          if (currentTag === 'DEAT') p.deathPlace = value.trim();
          if (currentEvent) currentEvent.place = value.trim();
        } else if (tagOrId === 'NOTE' && (currentEvent || currentTag === 'BIRT' || currentTag === 'DEAT')) {
          const targetEvent = currentEvent || (currentTag === 'BIRT'
            ? ensureEvent('Birth', 'birth')
            : currentTag === 'DEAT'
              ? ensureEvent('Death', 'death')
              : null);
          if (targetEvent) {
            targetEvent.description = `${targetEvent.description || ''}\nNote: ${value.trim()}`.trim();
          }
        } else if (tagOrId === 'TYPE' && currentEvent) {
          const typeText = value.trim();
          if (currentTag === 'EVEN' && typeText) {
            currentEvent.type = typeText;
          }
          currentEvent.description = currentEvent.description
            ? `${currentEvent.description}\nType: ${typeText}`
            : `Type: ${typeText}`;
        } else if (tagOrId === 'SOUR') {
          const srcId = value.replace(/@/g, '').trim();
          if (srcId) {
            (p.sourceIds || (p.sourceIds = [])).push(srcId);
          } else if (value.trim()) {
            const inlineId = `inline-${currentId}-${(p.inlineSources?.length || 0) + 1}`;
            const inlineSource: Source = {
              id: inlineId,
              title: value.trim(),
              type: 'Unknown',
              reliability: 1,
              actualText: value.trim()
            };
            p.inlineSources?.push(inlineSource);
          }
        } else if (level === 1 && !supportedIndividualTags.has(tagOrId)) {
          warnings.push(`Ignored individual tag "${tagOrId}" on record ${currentId}`);
        }
      } else if (currentType === 'FAM' && parsedFamilies[currentId]) {
        const f = parsedFamilies[currentId];
        const valId = value.replace(/@/g, '').trim();
        if (tagOrId === 'HUSB') f.husb = valId;
        else if (tagOrId === 'WIFE') f.wife = valId;
        else if (tagOrId === 'CHIL') f.children.push(valId);
        else if (tagOrId === 'MARR') currentTag = 'MARR';
        else if (tagOrId === 'DATE' && level === 2 && currentTag === 'MARR') f.date = value.trim();
        else if (tagOrId === 'PLAC' && level === 2 && currentTag === 'MARR') f.place = value.trim();
        else if (tagOrId === 'TYPE' && level === 2 && currentTag === 'MARR') f.type = value.trim();
        else if (level === 1 && !supportedFamilyTags.has(tagOrId)) {
          warnings.push(`Ignored family tag "${tagOrId}" on record ${currentId}`);
        }
      } else if (currentType === 'SOUR' && parsedSources[currentId]) {
        const source = parsedSources[currentId];
        switch (tagOrId) {
          case 'TITL':
            source.title = value.trim();
            break;
          case 'AUTH':
            source.repository = value.trim();
            break;
          case 'PUBL':
            source.notes = value.trim();
            break;
          case 'TEXT':
            source.actualText = value.trim();
            break;
          case 'NOTE':
            source.notes = `${source.notes || ''}\n${value.trim()}`.trim();
            break;
          case 'URL':
            source.url = value.trim();
            break;
          case 'DATE':
            source.citationDate = value.trim();
            break;
          default:
            warnings.push(`Ignored source tag "${tagOrId}" on source ${currentId}`);
        }
      }
    });

    const finalPeople: Person[] = Object.values(parsedPeople).map((p) => {
      const sourceList: Source[] = [];
      (p.sourceIds || []).forEach((id) => {
        const src = parsedSources[id];
        if (src) {
          sourceList.push({ ...src });
        } else {
          warnings.push(`Person ${p.id} referenced missing source ${id}`);
        }
      });
      (p.inlineSources || []).forEach((src) => sourceList.push(src));
      return {
        ...p,
        events: p.events || [],
        sources: sourceList
      } as Person;
    });

    const finalRelationships: Relationship[] = [];

    Object.values(parsedFamilies).forEach((f, idx) => {
      if (f.husb && f.wife) {
        finalRelationships.push({
          id: `rel-m-${idx}`,
          treeId: 'imported',
          type: 'marriage',
          personId: f.husb,
          relatedId: f.wife,
          date: f.date,
          place: f.place,
          notes: f.type,
          confidence: 'Confirmed'
        });
      }
      f.children.forEach((childId, cIdx) => {
        if (f.husb) {
          finalRelationships.push({
            id: `rel-f-${idx}-${cIdx}`,
            treeId: 'imported',
            type: 'bio_father',
            personId: f.husb,
            relatedId: childId,
            confidence: 'Confirmed'
          });
        }
        if (f.wife) {
          finalRelationships.push({
            id: `rel-mo-${idx}-${cIdx}`,
            treeId: 'imported',
            type: 'bio_mother',
            personId: f.wife,
            relatedId: childId,
            confidence: 'Confirmed'
          });
        }
      });
    });

    return { people: finalPeople, relationships: finalRelationships, warnings };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus('idle');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = parseGEDCOM(text);
        
        setImportStats({ people: data.people.length, relationships: data.relationships.length });
        setImportWarnings(data.warnings);
        onImport(data);
        setStatus('success');
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
    let ged = "0 HEAD\n1 SOUR LINEGRA\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n";
    people.forEach(p => {
      ged += `0 @P${p.id}@ INDI\n1 NAME ${p.firstName} /${p.lastName}/\n1 SEX ${p.gender}\n`;
      if (p.birthDate) ged += `1 BIRT\n2 DATE ${p.birthDate}\n2 PLAC ${typeof p.birthPlace === 'string' ? p.birthPlace : p.birthPlace?.fullText || ''}\n`;
      if (p.deathDate) ged += `1 DEAT\n2 DATE ${p.deathDate}\n2 PLAC ${typeof p.deathPlace === 'string' ? p.deathPlace : p.deathPlace?.fullText || ''}\n`;
    });

    const processedFamilies = new Set<string>();
    relationships.forEach((r, idx) => {
      if (r.type === 'marriage') {
        const familyKey = [r.personId, r.relatedId].sort().join('-');
        if (!processedFamilies.has(familyKey)) {
          ged += `0 @F${idx}@ FAM\n1 HUSB @P${r.personId}@\n1 WIFE @P${r.relatedId}@\n`;
          ged += `1 MARR\n`;
          if (r.date) {
            ged += `2 DATE ${r.date}\n`;
          }
          const placeText = typeof r.place === 'string' ? r.place : (typeof r.place === 'object' ? r.place?.fullText : '');
          if (placeText) {
            ged += `2 PLAC ${placeText}\n`;
          }
          if (r.notes) {
            ged += `2 TYPE ${r.notes}\n`;
          }
          // Find children for this marriage
          relationships.filter(childRel => 
            (childRel.type === 'bio_father' && childRel.personId === r.personId) || 
            (childRel.type === 'bio_mother' && childRel.personId === r.relatedId)
          ).forEach(childRel => {
            ged += `1 CHIL @P${childRel.relatedId}@\n`;
          });
          processedFamilies.add(familyKey);
        }
      }
    });

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

      <div className={`p-8 rounded-[40px] border-2 transition-all duration-500 ${isLive ? 'bg-white border-emerald-100 shadow-emerald-100/20' : 'bg-amber-50/50 border-amber-200 shadow-amber-200/20'} shadow-2xl`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="flex gap-5">
            <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center shadow-lg transition-transform hover:scale-105 ${isLive ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
              {isLive ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-serif font-bold text-slate-900">
                  {isLive ? 'Archive Synchronized' : 'Standalone Mode'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isLive ? 'Real-time' : 'Simulated'}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1 max-w-md leading-relaxed">
                {isLive 
                  ? `Your lineage is safely stored in the cloud. All changes are persisted to your Supabase project.`
                  : "Currently exploring with offline mock data. Link your database to start building a real family legacy."}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-md active:scale-95 ${isLive ? 'bg-slate-100 text-slate-900 hover:bg-slate-200' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
          >
            {showConfig ? 'Hide Settings' : isLive ? 'Edit Connection' : 'Get Started'}
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {showConfig && (
          <div className="pt-8 border-t border-slate-200/50 space-y-8 animate-in slide-in-from-top-4">
            <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold">Setup Guide</h4>
              </div>
              <ol className="text-sm text-slate-300 space-y-3 list-decimal ml-5">
                <li>Create a free project at <a href="https://supabase.com" target="_blank" className="text-blue-400 underline font-bold">Supabase.com</a></li>
                <li>Go to <b>Project Settings &gt; API</b> in your Supabase dashboard.</li>
                <li>Copy the <b>Project URL</b> and <b>anon / public key</b> into the fields below.</li>
                <li>Click <b>"Link Live Database"</b> and the app will refresh.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Project URL</label>
                <div className="relative group">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="https://your-project.supabase.co"
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all text-sm shadow-sm"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Anon / Public Key</label>
                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                  <input 
                    type="password" 
                    placeholder="eyJhbGciOiJIUzI1NiI..."
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all text-sm shadow-sm"
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                  />
                </div>
              </div>
            </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <p className="text-xs text-slate-500 italic max-w-sm">
                <b>Note:</b> These keys are stored locally in your browser and never sent to our servers.
              </p>
              <div className="flex gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => { localStorage.clear(); window.location.reload(); }}
                  className="px-6 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100/50 rounded-xl transition-colors"
                >
                  Clear Config
                </button>
                <button 
                  onClick={handleSaveConfig}
                  className="flex-1 sm:flex-none px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-xl hover:shadow-slate-200 flex items-center justify-center gap-2"
                >
                  Link Live Database
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Import INDI, FAM, and relationships from standard GEDCOM files.</p>
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
          <p className="text-sm text-slate-500 mt-2 mb-8 leading-relaxed">Preserve your research offline with a standard GEDCOM 5.5.1 archive backup.</p>
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
    </div>
  );
};

export default ImportExport;
