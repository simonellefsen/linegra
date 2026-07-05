import React, { useEffect, useRef, useState } from 'react';
import { Lock, Trash2, Dna, Upload, FileText } from 'lucide-react';
import { DnaConsentScope, DNATest } from '../../types';
import { DNA_VENDORS, DNA_TEST_TYPES } from './constants';
import { parseAutosomalCsv, parseSharedSegmentsCsv } from '../../lib/dnaRawParser';
import { describeSharedLineage } from '../../lib/dnaClassification';
import { analyzeHaplogroupCoverage } from '../../lib/haplogroupRoutes';
import {
  buildAutosomalMarkerIndex,
  indexStatsFromIndex,
  serializeMarkerIndex,
} from '../../lib/dnaAutosomalIndex';
import {
  canStoreEncryptedRawDna,
  encryptRawPayload,
  MAX_INLINE_ENCRYPTED_RAW_BYTES,
} from '../../lib/dnaRawEncryption';
import DnaRawConsentModal from '../dna/DnaRawConsentModal';
import SharedSegmentImportModal from '../dna/SharedSegmentImportModal';
import HaplogroupMigrationCard from '../dna/HaplogroupMigrationCard';
import { purgeDnaRawData, updateSharedAutosomalKitOwner, fetchAutosomalTesterNameRows } from '../../services/archive';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { mapDbRowToNameLookup } from '../../lib/dnaPersonNameVariants';
import type { DNASharedSegmentRowPreview, DNASharedSegmentSummary } from '../../types';
import type { SharedImportNameRow } from '../../lib/dnaSharedImportOwner';
import type { SharedSegmentImportConfirmPayload } from '../dna/SharedSegmentImportModal';
import { resolveSharedAutosomalParties } from '../../lib/dnaSharedTestParties';

interface DNATabProps {
  personId: string;
  treeId?: string | null;
  personNameCandidates: string[];
  dnaTests: DNATest[];
  canAccessDNA: boolean;
  onAddTest: (options?: { type?: DNATest['type'] }) => string;
  onUpdateTest: (id: string, updates: Partial<DNATest>) => void;
  onRemoveTest: (id: string) => void;
  onAddMarriedNameAlias?: (fullName: string) => void;
  onOpenPersonId?: (personId: string) => void;
}

// Resolved-lineage status shown on the profile DNA tab. Mirrors the admin DNA panel's
// verdict (path found + cM compatibility + cM prediction) via the shared, tested
// describeSharedLineage helper, so both surfaces agree (SPEC §6.3).
const SharedLineageStatusBadge: React.FC<{
  totalCentimorgans: number;
  segmentCount: number;
  pathRelationshipIds?: string[];
}> = ({ totalCentimorgans, segmentCount, pathRelationshipIds }) => {
  const pathLinks = pathRelationshipIds?.length ?? 0;
  const { pathFound, cmCompatible, prediction } = describeSharedLineage(
    totalCentimorgans,
    segmentCount,
    pathLinks
  );

  const tone = !pathFound
    ? 'border-white/20 bg-white/5 text-white/60'
    : cmCompatible
      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
      : 'border-amber-300/40 bg-amber-400/10 text-amber-100';

  const links = `${pathLinks} link${pathLinks === 1 ? '' : 's'}`;
  const label = !pathFound
    ? 'Shared match saved — no lineage path linked yet'
    : cmCompatible
      ? `Lineage path verified — cM compatible (${links})`
      : `Lineage path linked — review cM mismatch (${links})`;

  return (
    <div className="space-y-2">
      <p>
        cM prediction: <span className="font-semibold text-white">{prediction}</span>
      </p>
      <p className={`inline-flex items-center gap-2 rounded-xl border px-2 py-1 ${tone}`}>
        <Dna className="w-3.5 h-3.5" />
        {label}
      </p>
    </div>
  );
};

const nameForTreePerson = (people: SharedImportNameRow[], id: string) => {
  const row = people.find((entry) => entry.id === id);
  if (!row) return null;
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null;
};

const SharedKitOwnerField: React.FC<{
  test: DNATest;
  personId: string;
  autosomalTesters: SharedImportNameRow[];
  kitOwnerPersonId?: string;
  kitOwnerDisplayName: string;
  suggestedKitOwnerPersonId: string | null;
  loadingTesters: boolean;
  savingKitOwner: boolean;
  onOpenPersonId?: (personId: string) => void;
  onKitOwnerChange: (test: DNATest, ownerPersonId: string) => void;
}> = ({
  test,
  personId,
  autosomalTesters,
  kitOwnerPersonId,
  kitOwnerDisplayName,
  suggestedKitOwnerPersonId,
  loadingTesters,
  savingKitOwner,
  onOpenPersonId,
  onKitOwnerChange,
}) => {
  const suggestedName = suggestedKitOwnerPersonId
    ? nameForTreePerson(autosomalTesters, suggestedKitOwnerPersonId)
    : null;
  const showSuggestion =
    suggestedKitOwnerPersonId &&
    suggestedKitOwnerPersonId !== kitOwnerPersonId &&
    suggestedName;
  const storedOwnerIsTester =
    !kitOwnerPersonId || autosomalTesters.some((row) => row.id === kitOwnerPersonId);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span>Autosomal tester:</span>
        <select
          value={kitOwnerPersonId || ''}
          disabled={loadingTesters || savingKitOwner}
          onChange={(e) => {
            const nextOwnerId = e.target.value;
            if (nextOwnerId) onKitOwnerChange(test, nextOwnerId);
          }}
          className="max-w-full rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-white outline-none focus:border-blue-300"
        >
          <option value="" className="text-slate-900">
            {kitOwnerDisplayName !== 'Unknown' ? kitOwnerDisplayName : 'Select autosomal tester…'}
          </option>
          {autosomalTesters
            .filter((row) => row.id !== personId)
            .map((row) => (
              <option key={row.id} value={row.id} className="text-slate-900">
                {nameForTreePerson(autosomalTesters, row.id) || row.id}
              </option>
            ))}
        </select>
        {kitOwnerPersonId && kitOwnerPersonId !== personId && onOpenPersonId && (
          <button
            type="button"
            onClick={() => onOpenPersonId(kitOwnerPersonId)}
            className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-200 underline decoration-dotted underline-offset-2 hover:text-blue-100"
          >
            Open profile
          </button>
        )}
        {savingKitOwner && <span className="text-white/50">Saving…</span>}
      </div>
      {showSuggestion && (
        <button
          type="button"
          disabled={savingKitOwner}
          onClick={() => onKitOwnerChange(test, suggestedKitOwnerPersonId)}
          className="text-[10px] text-amber-200 underline decoration-dotted underline-offset-2 hover:text-amber-100"
        >
          Use suggested autosomal tester: {suggestedName}
        </button>
      )}
      {!storedOwnerIsTester && kitOwnerPersonId && (
        <p className="text-[10px] text-amber-200">
          Stored owner is not a registered autosomal tester — pick a tester above to re-link.
        </p>
      )}
    </div>
  );
};

const SharedAutosomalPartyLine: React.FC<{
  label: string;
  name: string;
  personId?: string;
  currentPersonId: string;
  onOpenPersonId?: (personId: string) => void;
}> = ({ label, name, personId, currentPersonId, onOpenPersonId }) => (
  <p>
    {label}:{' '}
    {personId && personId !== currentPersonId && onOpenPersonId ? (
      <button
        type="button"
        onClick={() => onOpenPersonId(personId)}
        className="font-semibold text-blue-200 underline decoration-dotted underline-offset-2 hover:text-blue-100"
      >
        {name}
      </button>
    ) : (
      <span className="font-semibold text-white">{name}</span>
    )}
  </p>
);

const DNATab: React.FC<DNATabProps> = ({
  personId,
  treeId,
  dnaTests,
  canAccessDNA,
  onAddTest,
  onUpdateTest,
  onRemoveTest,
  onAddMarriedNameAlias,
  onOpenPersonId,
}) => (
  <DNATabInner
    personId={personId}
    treeId={treeId}
    dnaTests={dnaTests}
    canAccessDNA={canAccessDNA}
    onAddTest={onAddTest}
    onUpdateTest={onUpdateTest}
    onRemoveTest={onRemoveTest}
    onAddMarriedNameAlias={onAddMarriedNameAlias}
    onOpenPersonId={onOpenPersonId}
  />
);

const DNATabInner: React.FC<Omit<DNATabProps, 'personNameCandidates'>> = ({
  personId,
  treeId,
  dnaTests,
  canAccessDNA,
  onAddTest,
  onUpdateTest,
  onRemoveTest,
  onAddMarriedNameAlias,
  onOpenPersonId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'autosomal_raw' | 'shared_segments' | 'shared_segments_batch' | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingAutosomalImport, setPendingAutosomalImport] = useState<{
    testId: string;
    text: string;
    fileName: string;
  } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [purgingTestId, setPurgingTestId] = useState<string | null>(null);
  const [treePeople, setTreePeople] = useState<SharedImportNameRow[]>([]);
  const [autosomalTesters, setAutosomalTesters] = useState<SharedImportNameRow[]>([]);
  const [loadingTreePeople, setLoadingTreePeople] = useState(false);
  const [loadingAutosomalTesters, setLoadingAutosomalTesters] = useState(false);
  const [pendingSharedImport, setPendingSharedImport] = useState<{
    testId: string;
    summary: DNASharedSegmentSummary;
    preview: DNASharedSegmentRowPreview[];
  } | null>(null);
  const [pendingSharedBatch, setPendingSharedBatch] = useState<
    Array<{
      testId: string;
      summary: DNASharedSegmentSummary;
      preview: DNASharedSegmentRowPreview[];
    }>
  | null>(null);
  const [savingKitOwnerTestId, setSavingKitOwnerTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!treeId || !isSupabaseConfigured()) {
      setTreePeople([]);
      return;
    }
    let cancelled = false;
    setLoadingTreePeople(true);
    void (async () => {
      const { data, error } = await supabase
        .from('persons')
        .select('id, first_name, last_name, maiden_name, metadata')
        .eq('tree_id', treeId)
        .order('last_name');
      if (cancelled) return;
      if (error) {
        setTreePeople([]);
      } else {
        setTreePeople(((data || []) as any[]).map((row) => mapDbRowToNameLookup(row)));
      }
      setLoadingTreePeople(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  useEffect(() => {
    if (!treeId || !isSupabaseConfigured()) {
      setAutosomalTesters([]);
      return;
    }
    let cancelled = false;
    setLoadingAutosomalTesters(true);
    void fetchAutosomalTesterNameRows(treeId)
      .then((rows) => {
        if (!cancelled) setAutosomalTesters(rows);
      })
      .catch(() => {
        if (!cancelled) setAutosomalTesters([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAutosomalTesters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  useEffect(() => {
    const handleResolved = (event: Event) => {
      const detail = (event as CustomEvent<{
        dnaTestId?: string | null;
        pathPersonIds?: string[];
        pathRelationshipIds?: string[];
      }>).detail;
      if (!detail?.dnaTestId) return;
      onUpdateTest(detail.dnaTestId, {
        sharedPathPersonIds: detail.pathPersonIds || [],
        sharedPathRelationshipIds: detail.pathRelationshipIds || [],
      });
    };
    window.addEventListener('linegra:dna-lineage-resolved', handleResolved);
    return () => window.removeEventListener('linegra:dna-lineage-resolved', handleResolved);
  }, [onUpdateTest]);

  const handleOpenImport = (testId: string, mode: 'autosomal_raw' | 'shared_segments' | 'shared_segments_batch') => {
    setImportError(null);
    setImportTargetId(testId);
    setImportMode(mode);
    fileInputRef.current?.click();
  };

  const handleAddSharedMatch = () => {
    const newTestId = onAddTest({ type: 'Shared Autosomal' });
    handleOpenImport(newTestId, 'shared_segments');
  };

  const handleAddSharedMatchBatch = () => {
    setImportError(null);
    setImportMode('shared_segments_batch');
    setImportTargetId('batch');
    fileInputRef.current?.click();
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const targetId = importTargetId;
    const mode = importMode;
    e.target.value = '';
    if (!files.length || !targetId || !mode) return;
    try {
      if (mode === 'autosomal_raw') {
        const file = files[0];
        if (!file) return;
        const text = await file.text();
        parseAutosomalCsv(text, file.name);
        setPendingAutosomalImport({ testId: targetId, text, fileName: file.name });
        setConsentOpen(true);
        return;
      }
      if (mode === 'shared_segments_batch') {
        const parsed: Array<{
          testId: string;
          summary: DNASharedSegmentSummary;
          preview: DNASharedSegmentRowPreview[];
        }> = [];
        for (const file of files) {
          const text = await file.text();
          const { summary, preview } = parseSharedSegmentsCsv(text, file.name);
          parsed.push({ testId: onAddTest({ type: 'Shared Autosomal' }), summary, preview });
        }
        if (!parsed.length) return;
        setPendingSharedBatch(parsed);
        return;
      }
      const file = files[0];
      if (!file) return;
      const text = await file.text();
      const { summary, preview } = parseSharedSegmentsCsv(text, file.name);
      setPendingSharedImport({ testId: targetId, summary, preview });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not parse DNA CSV file.';
      setImportError(message);
    } finally {
      setImportTargetId(null);
      setImportMode(null);
    }
  };

  const finalizeAutosomalImport = async (scope: DnaConsentScope) => {
    if (!pendingAutosomalImport) return;
    setImportError(null);
    try {
      const { summary, preview } = parseAutosomalCsv(
        pendingAutosomalImport.text,
        pendingAutosomalImport.fileName
      );
      const updates: Partial<DNATest> = {
        type: 'Autosomal',
        rawDataSummary: summary,
        consentGivenAt: new Date().toISOString(),
        consentScope: scope,
        isPrivate: scope === 'raw_autosomal_storage',
      };
      if (scope === 'raw_autosomal_storage') {
        if (!canStoreEncryptedRawDna()) {
          throw new Error('Encrypted storage requires VITE_DNA_ENCRYPTION_KEY in the environment.');
        }
        const index = buildAutosomalMarkerIndex(pendingAutosomalImport.text);
        const encrypted = await encryptRawPayload(
          serializeMarkerIndex(index),
          import.meta.env.VITE_DNA_ENCRYPTION_KEY as string
        );
        if (encrypted.length > MAX_INLINE_ENCRYPTED_RAW_BYTES) {
          throw new Error('Kit is too large for inline encrypted storage. Use summary-only consent.');
        }
        updates.encryptedRawPayload = encrypted;
        updates.rawMarkerIndexStats = indexStatsFromIndex(index);
        updates.hasEncryptedRaw = true;
      } else {
        updates.rawDataPreview = preview;
        updates.encryptedRawPayload = undefined;
        updates.rawMarkerIndexStats = undefined;
        updates.hasEncryptedRaw = false;
      }
      onUpdateTest(pendingAutosomalImport.testId, updates);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import autosomal raw file.');
    } finally {
      setPendingAutosomalImport(null);
      setConsentOpen(false);
      setImportTargetId(null);
      setImportMode(null);
    }
  };

  const handlePurgeRawData = async (test: DNATest) => {
    if (!UUID_REGEX.test(test.id) || purgingTestId) return;
    setPurgingTestId(test.id);
    setImportError(null);
    try {
      await purgeDnaRawData(test.id);
      onUpdateTest(test.id, {
        consentGivenAt: undefined,
        consentScope: undefined,
        encryptedRawPayload: undefined,
        rawMarkerIndexStats: undefined,
        hasEncryptedRaw: false,
        rawDataPreview: undefined,
        rawDataSummary: undefined,
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not purge raw DNA data.');
    } finally {
      setPurgingTestId(null);
    }
  };

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const applySharedImport = (
    items: Array<{ testId: string; summary: DNASharedSegmentSummary; preview: DNASharedSegmentRowPreview[] }>,
    payload: SharedSegmentImportConfirmPayload
  ) => {
    items.forEach(({ testId, summary, preview }) => {
      onUpdateTest(testId, {
        type: 'Shared Autosomal',
        sharedPersonId: payload.ownerPersonId,
        sharedMatchName: summary.matchName,
        sharedMatchPersonId: payload.counterpartPersonId || undefined,
        sharedSegmentSummary: summary,
        sharedSegmentsPreview: preview,
      });
    });
    if (payload.saveMarriedNameAlias && payload.marriedNameAlias && onAddMarriedNameAlias) {
      onAddMarriedNameAlias(payload.marriedNameAlias);
    }
  };

  const finalizeSharedImport = (payload: SharedSegmentImportConfirmPayload) => {
    if (!pendingSharedImport) return;
    applySharedImport([pendingSharedImport], payload);
    setPendingSharedImport(null);
    setImportTargetId(null);
    setImportMode(null);
  };

  const finalizeSharedBatchImport = (payload: SharedSegmentImportConfirmPayload) => {
    if (!pendingSharedBatch?.length) return;
    applySharedImport(pendingSharedBatch, payload);
    setPendingSharedBatch(null);
    setImportTargetId(null);
    setImportMode(null);
  };

  const handleKitOwnerChange = async (test: DNATest, ownerPersonId: string) => {
    if (!ownerPersonId || ownerPersonId === personId) return;
    onUpdateTest(test.id, { sharedPersonId: ownerPersonId });
    if (!UUID_REGEX.test(test.id)) return;
    setSavingKitOwnerTestId(test.id);
    setImportError(null);
    try {
      await updateSharedAutosomalKitOwner(test.id, ownerPersonId);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not update kit owner.');
    } finally {
      setSavingKitOwnerTestId(null);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <DnaRawConsentModal
        open={consentOpen}
        fileName={pendingAutosomalImport?.fileName || ''}
        encryptionAvailable={canStoreEncryptedRawDna()}
        onCancel={() => {
          setConsentOpen(false);
          setPendingAutosomalImport(null);
          setImportTargetId(null);
          setImportMode(null);
        }}
        onConfirm={finalizeAutosomalImport}
      />
      {pendingSharedImport && (
        <SharedSegmentImportModal
          open
          summary={pendingSharedImport.summary}
          preview={pendingSharedImport.preview}
          treePeople={treePeople}
          autosomalTesters={autosomalTesters}
          defaultOwnerPersonId={personId}
          lockOwnerPersonId={personId}
          loadingPeople={loadingTreePeople || loadingAutosomalTesters}
          onClose={() => {
            setPendingSharedImport(null);
            setImportTargetId(null);
            setImportMode(null);
          }}
          onConfirm={finalizeSharedImport}
        />
      )}
      {pendingSharedBatch && pendingSharedBatch.length > 0 && (
        <SharedSegmentImportModal
          open
          summary={pendingSharedBatch[0]!.summary}
          preview={pendingSharedBatch[0]!.preview}
          batchSummaries={pendingSharedBatch.map((item) => ({
            fileName: item.summary.fileName,
            matchName: item.summary.matchName,
            segmentCount: item.summary.segmentCount,
            totalCentimorgans: item.summary.totalCentimorgans,
          }))}
          treePeople={treePeople}
          autosomalTesters={autosomalTesters}
          defaultOwnerPersonId={personId}
          lockOwnerPersonId={personId}
          loadingPeople={loadingTreePeople || loadingAutosomalTesters}
          onClose={() => {
            setPendingSharedBatch(null);
            setImportTargetId(null);
            setImportMode(null);
          }}
          onConfirm={finalizeSharedBatchImport}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        multiple={importMode === 'shared_segments_batch'}
        className="hidden"
        onChange={handleImportCsv}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Genetic Archive</p>
        <button onClick={() => onAddTest()} className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
          <Dna className="w-4 h-4" /> Log Result
        </button>
      </div>
      {!canAccessDNA ? (
        <div className="py-24 text-center space-y-4">
          <Lock className="w-12 h-12 text-slate-200 mx-auto" />
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">Restricted Access Record</p>
          <p className="text-xs text-slate-400 max-w-[200px] mx-auto italic">
            Genetic data is only available to project administrators and verified descendants.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {importError && <p className="text-xs font-semibold text-rose-500">{importError}</p>}
          {dnaTests.map((test) => (
            <div key={test.id} className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden group/dna shadow-2xl space-y-6">
              <button
                onClick={() => onRemoveTest(test.id)}
                className="absolute top-4 right-6 text-white/20 hover:text-rose-400 opacity-0 group-hover/dna:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <h4 className="text-2xl font-serif font-bold flex items-center gap-3">
                <Dna className="w-7 h-7 text-blue-400" />
                <select
                  value={test.vendor}
                  onChange={(e) => onUpdateTest(test.id, { vendor: e.target.value as DNATest['vendor'] })}
                  className="bg-transparent border-none outline-none font-serif text-white cursor-pointer"
                >
                  {DNA_VENDORS.map((vendor) => (
                    <option key={vendor} value={vendor} className="text-slate-900">
                      {vendor}
                    </option>
                  ))}
                </select>
              </h4>
              <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Test Type</p>
                <select
                  value={test.type}
                  onChange={(e) => onUpdateTest(test.id, { type: e.target.value as DNATest['type'] })}
                  className="bg-transparent border-none text-lg font-serif font-bold text-white outline-none w-full cursor-pointer"
                >
                  {DNA_TEST_TYPES.map((type) => (
                    <option key={type} value={type} className="text-slate-900">
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-4 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-3">Haplogroups</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Y-DNA</p>
                    <input
                      value={test.yHaplogroup || ''}
                      onChange={(e) => onUpdateTest(test.id, { yHaplogroup: e.target.value })}
                      placeholder="e.g. I-M6155"
                      className="bg-transparent border-none text-base font-serif font-bold text-white outline-none w-full"
                    />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">mtDNA</p>
                    <input
                      value={test.mtDnaHaplogroup || ''}
                      onChange={(e) => onUpdateTest(test.id, { mtDnaHaplogroup: e.target.value })}
                      placeholder="e.g. U1a1a2"
                      className="bg-transparent border-none text-base font-serif font-bold text-white outline-none w-full"
                    />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Mitotree</p>
                    <input
                      value={test.mitotree || ''}
                      onChange={(e) => onUpdateTest(test.id, { mitotree: e.target.value })}
                      placeholder="e.g. U1a1a2a1"
                      className="bg-transparent border-none text-base font-serif font-bold text-white outline-none w-full"
                    />
                  </div>
                </div>
              </div>
              <HaplogroupMigrationCard {...analyzeHaplogroupCoverage(test)} />
              {test.type === 'Autosomal' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleOpenImport(test.id, 'autosomal_raw')}
                    className="px-4 py-2 rounded-2xl border border-white/20 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Upload className="w-4 h-4" />
                    Import Autosomal Raw CSV
                  </button>
                  {test.rawDataSummary && (
                    <div className="p-4 bg-white/5 border border-white/10 rounded-3xl text-xs text-white/80 space-y-1">
                      <p className="font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-300" />
                        {test.rawDataSummary.fileName}
                      </p>
                      <p>
                        {test.rawDataSummary.markersTotal.toLocaleString()} markers •{' '}
                        {test.rawDataSummary.calledMarkers.toLocaleString()} called •{' '}
                        {test.rawDataSummary.noCallMarkers.toLocaleString()} no-calls
                      </p>
                      {test.consentGivenAt && (
                        <p className="text-white/60">
                          Consent: {test.consentScope || 'derived_only'} ·{' '}
                          {new Date(test.consentGivenAt).toLocaleString()}
                        </p>
                      )}
                      {test.rawMarkerIndexStats && (
                        <p className="text-emerald-200">
                          Encrypted SNP index · {test.rawMarkerIndexStats.calledMarkers.toLocaleString()} called SNPs
                        </p>
                      )}
                      {(test.hasEncryptedRaw || test.rawDataSummary) && UUID_REGEX.test(test.id) && (
                        <button
                          type="button"
                          disabled={purgingTestId === test.id}
                          onClick={() => handlePurgeRawData(test)}
                          className="mt-2 px-3 py-1.5 rounded-xl border border-rose-400/40 text-[10px] font-black uppercase tracking-[0.15em] text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          {purgingTestId === test.id ? 'Purging…' : 'Purge raw data'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {test.type === 'Shared Autosomal' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleOpenImport(test.id, 'shared_segments')}
                    className="px-4 py-2 rounded-2xl border border-white/20 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Upload className="w-4 h-4" />
                    {test.sharedSegmentSummary ? 'Replace this match CSV' : 'Import Shared DNA CSV'}
                  </button>
                  {test.sharedSegmentSummary && (
                    <div className="p-4 bg-white/5 border border-white/10 rounded-3xl text-xs text-white/80 space-y-1">
                      <p className="font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-300" />
                        {test.sharedSegmentSummary.fileName}
                      </p>
                      {(() => {
                        const parties = resolveSharedAutosomalParties(personId, test, treePeople);
                        return (
                          <>
                            <SharedKitOwnerField
                              test={test}
                              personId={personId}
                              autosomalTesters={autosomalTesters}
                              kitOwnerPersonId={parties.kitOwner.personId}
                              kitOwnerDisplayName={parties.kitOwner.displayName}
                              suggestedKitOwnerPersonId={parties.suggestedKitOwnerPersonId}
                              loadingTesters={loadingAutosomalTesters}
                              savingKitOwner={savingKitOwnerTestId === test.id}
                              onOpenPersonId={onOpenPersonId}
                              onKitOwnerChange={handleKitOwnerChange}
                            />
                            <SharedAutosomalPartyLine
                              label="Match"
                              name={parties.match.displayName}
                              personId={parties.match.personId}
                              currentPersonId={personId}
                              onOpenPersonId={onOpenPersonId}
                            />
                          </>
                        );
                      })()}
                      <p>
                        {test.sharedSegmentSummary.segmentCount} segments • {test.sharedSegmentSummary.totalCentimorgans.toFixed(1)} cM total •{' '}
                        {test.sharedSegmentSummary.largestSegmentCentimorgans.toFixed(1)} cM largest
                      </p>
                      <SharedLineageStatusBadge
                        totalCentimorgans={test.sharedSegmentSummary.totalCentimorgans}
                        segmentCount={test.sharedSegmentSummary.segmentCount}
                        pathRelationshipIds={test.sharedPathRelationshipIds}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-3xl">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Internal Notes</p>
                <textarea
                  value={test.notes || ''}
                  onChange={(e) => onUpdateTest(test.id, { notes: e.target.value })}
                  placeholder="Researcher observations..."
                  className="bg-transparent border-none text-xs font-medium text-white/70 outline-none w-full resize-none min-h-[40px]"
                />
              </div>
            </div>
          ))}
          {canAccessDNA && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAddSharedMatch}
                className="w-full px-6 py-4 rounded-[32px] border-2 border-dashed border-slate-300 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Add shared match
              </button>
              <button
                type="button"
                onClick={handleAddSharedMatchBatch}
                className="w-full px-6 py-4 rounded-[32px] border-2 border-dashed border-slate-300 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center justify-center gap-2 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import multiple CSVs
              </button>
            </div>
          )}
          {dnaTests.length === 0 && <p className="text-center py-20 text-xs text-slate-400 italic">No genetic records logged in this archive.</p>}
        </div>
      )}
    </div>
  );
};

export default DNATab;
