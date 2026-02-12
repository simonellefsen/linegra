import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Dna, Loader2, Search, Sparkles } from 'lucide-react';
import { DNAAutosomalCandidate, DNASharedMatchRecord, DnaLineageResolution } from '../types';
import {
  listAutosomalPeopleInTree,
  listSharedMatchesForAutosomalPerson,
  resolveSharedMatchLineage,
  resolveSharedTestLineage,
} from '../services/archive';

interface AdminDnaPanelProps {
  treeId: string | null;
  actor?: { id?: string | null; name?: string | null };
}

const formatVitals = (birthYear?: string | null, deathYear?: string | null) => {
  if (!birthYear && !deathYear) return 'Unknown vitals';
  if (birthYear && deathYear) return `${birthYear} - ${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  return `d. ${deathYear}`;
};

const formatCm = (value: number | null) => (typeof value === 'number' ? `${value.toFixed(1)} cM` : 'n/a');

const AdminDnaPanel: React.FC<AdminDnaPanelProps> = ({ treeId, actor }) => {
  const [candidates, setCandidates] = useState<DNAAutosomalCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [personSearch, setPersonSearch] = useState('');
  const [matches, setMatches] = useState<DNASharedMatchRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [resolvingMatchId, setResolvingMatchId] = useState<string | null>(null);
  const [resolutionByMatchId, setResolutionByMatchId] = useState<Record<string, DnaLineageResolution>>({});
  const [error, setError] = useState<string | null>(null);

  const filteredCandidates = useMemo(() => {
    const term = personSearch.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((candidate) => candidate.name.toLowerCase().includes(term));
  }, [candidates, personSearch]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.personId === selectedPersonId) || null,
    [candidates, selectedPersonId]
  );

  const loadCandidates = useCallback(async () => {
    if (!treeId) return;
    setLoadingCandidates(true);
    setError(null);
    try {
      const rows = await listAutosomalPeopleInTree(treeId);
      setCandidates(rows);
      setSelectedPersonId((current) => {
        if (current && rows.some((row) => row.personId === current)) return current;
        return rows[0]?.personId || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load autosomal test candidates.');
      setCandidates([]);
      setSelectedPersonId('');
    } finally {
      setLoadingCandidates(false);
    }
  }, [treeId]);

  const loadMatches = useCallback(async () => {
    if (!treeId || !selectedPersonId) {
      setMatches([]);
      return;
    }
    setLoadingMatches(true);
    setError(null);
    try {
      const rows = await listSharedMatchesForAutosomalPerson(treeId, selectedPersonId);
      setMatches(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared autosomal matches.');
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [treeId, selectedPersonId]);

  useEffect(() => {
    setResolutionByMatchId({});
    setMatches([]);
    if (!treeId) {
      setCandidates([]);
      setSelectedPersonId('');
      return;
    }
    loadCandidates();
  }, [treeId, loadCandidates]);

  useEffect(() => {
    loadMatches();
  }, [treeId, selectedPersonId, loadMatches]);

  const handleResolveLineage = async (matchId: string) => {
    if (!treeId || !selectedPersonId || resolvingMatchId) return;
    setResolvingMatchId(matchId);
    setError(null);
    try {
      const match = matches.find((item) => item.id === matchId);
      if (!match) {
        throw new Error('Selected DNA match is no longer available.');
      }
      const resolution =
        match.source === 'dna_match'
          ? await resolveSharedMatchLineage(treeId, selectedPersonId, match.dnaMatchId || match.id, actor)
          : await resolveSharedTestLineage(
              treeId,
              selectedPersonId,
              match.dnaTestId || match.id.replace(/^test:/, ''),
              match.counterpartPersonId,
              actor
            );
      setResolutionByMatchId((prev) => ({ ...prev, [matchId]: resolution }));
      await loadMatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve lineage path.');
    } finally {
      setResolvingMatchId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">DNA Panel</p>
          <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">Autosomal Match Lineage Review</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl">
            Pick a person with an Autosomal test, inspect shared autosomal matches in this tree, and run lineage path
            resolution. The action will attach DNA support to relationship links when the found path fits the cM-based prediction.
          </p>
        </div>
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>
        )}
        {!treeId ? (
          <p className="text-sm text-slate-500">Select an active tree first.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,1fr),360px] gap-5 items-start">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Search person</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Type name..."
                    className="bg-transparent border-none outline-none text-sm text-slate-700 w-full"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Autosomal tester</label>
                  <select
                    value={selectedPersonId}
                    onChange={(e) => setSelectedPersonId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700"
                    disabled={loadingCandidates || filteredCandidates.length === 0}
                  >
                    {loadingCandidates ? (
                      <option value="">Loading…</option>
                    ) : filteredCandidates.length === 0 ? (
                      <option value="">No autosomal test persons found</option>
                    ) : (
                      filteredCandidates.map((candidate) => (
                        <option key={candidate.personId} value={candidate.personId}>
                          {candidate.name} ({formatVitals(candidate.birthYear, candidate.deathYear)})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {selectedCandidate && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected</p>
                    <p className="font-bold text-slate-900">{selectedCandidate.name}</p>
                    <p className="text-xs text-slate-500">{formatVitals(selectedCandidate.birthYear, selectedCandidate.deathYear)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Autosomal tests: <span className="font-bold text-slate-700">{selectedCandidate.autosomalTestCount}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Shared autosomal matches</p>
                {loadingMatches && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
              </div>
              {!selectedPersonId ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Select a person to load matches.
                </div>
              ) : matches.length === 0 && !loadingMatches ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No shared autosomal matches found for this person.
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {matches.map((match) => {
                    const resolution = resolutionByMatchId[match.id];
                    const pathText = resolution?.pathLabel
                      ? resolution.pathLabel
                      : match.pathFound
                      ? `${match.pathPersonIds.length} people linked via ${match.pathRelationshipIds.length} relationships`
                      : 'No linked lineage path';
                    return (
                      <div key={match.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{match.counterpartPersonName}</p>
                            <p className="text-xs text-slate-500">Test owner: {match.ownerPersonName}</p>
                            {match.fileName && (
                              <p className="text-xs text-slate-400 truncate max-w-[440px]">File: {match.fileName}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleResolveLineage(match.id)}
                            disabled={resolvingMatchId === match.id}
                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] ${
                              resolvingMatchId === match.id
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {resolvingMatchId === match.id ? 'Checking…' : 'Resolve lineage'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-slate-600">
                          <div className="rounded-xl bg-slate-50 px-2 py-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Shared</p>
                            <p className="font-bold">{formatCm(match.sharedCM)}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-2 py-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Segments</p>
                            <p className="font-bold">{match.segments ?? 'n/a'}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-2 py-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Largest</p>
                            <p className="font-bold">{formatCm(match.longestSegment)}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-2 py-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Confidence</p>
                            <p className="font-bold">{match.confidence ?? 'n/a'}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-2 py-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Prediction</p>
                            <p className="font-bold">{match.predictionLabel}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 border ${
                              match.pathFound
                                ? match.pathFitsPrediction
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}
                          >
                            {match.pathFound ? <Dna className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                            {match.pathFound
                              ? match.pathFitsPrediction
                                ? 'Path linked + cM compatible'
                                : 'Path found, review cM mismatch'
                              : 'No lineage path linked'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            {pathText}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDnaPanel;
