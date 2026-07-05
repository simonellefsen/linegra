import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Dna, GitBranch, Layers, Loader2, Search, Sparkles, UserPlus, Link2, X } from 'lucide-react';
import { DNAAutosomalCandidate, DNASharedMatchRecord, DnaLineageResolution, Person, Relationship, UnlinkedDnaMatchRecord } from '../types';
import { clusterSharedSegments, segmentsFromPreview, summarizeClusterIcw } from '../lib/dnaClustering';
import DnaSegmentPainterView from './dna/DnaSegmentPainterView';
import DnaLineagePathBreadcrumb from './dna/DnaLineagePathBreadcrumb';
import type { PaintSegmentInput } from '../lib/dnaSegmentPainter';
import { suggestMrcaCandidates, type MatchLineageInput } from '../lib/dnaMrcaSuggestions';
import {
  buildDnaLineagePathBreadcrumb,
  formatDnaLineagePathSummary,
  pickLineageMrcaPersonId,
} from '../lib/dnaLineagePathLabel';
import {
  grandparentSlotShortLabel,
  inferPathGrandparentSlot,
  inferPathParentalSide,
  resolveGrandparentSlots,
  type GrandparentSlot,
  type ParentalSideHint,
} from '../lib/dnaParentalHints';
import { suggestUnknownMatchPlacements } from '../lib/dnaMatchPlacement';
import {
  createDnaMatchPlaceholderPerson,
  dismissUnlinkedDnaMatchForFocus,
  linkUnlinkedDnaTestToPerson,
  listAutosomalPeopleInTree,
  listAutosomalRawKitsForTree,
  listSharedMatchesForAutosomalPerson,
  listUnlinkedSharedMatchesForAutosomalPerson,
  loadDnaPathRelationshipsForTree,
  resolveFamilyKitLineage,
  resolveSharedMatchLineage,
  resolveSharedTestLineage,
} from '../services/archive';
import {
  compareAutosomalMarkerIndices,
  deserializeMarkerIndex,
} from '../lib/dnaAutosomalIndex';
import {
  canStoreEncryptedRawDna,
  decryptRawPayload,
  resolveDnaEncryptionKey,
} from '../lib/dnaRawEncryption';

interface AdminDnaPanelProps {
  treeId: string | null;
  people?: Person[];
  relationships?: Relationship[];
  actor?: { id?: string | null; name?: string | null };
  onOpenPerson?: (personId: string) => void | Promise<void>;
  onViewLineageInTree?: (personId: string) => void | Promise<void>;
}

const formatVitals = (birthYear?: string | null, deathYear?: string | null) => {
  if (!birthYear && !deathYear) return 'Unknown vitals';
  if (birthYear && deathYear) return `${birthYear} - ${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  return `d. ${deathYear}`;
};

const formatCm = (value: number | null) => (typeof value === 'number' ? `${value.toFixed(1)} cM` : 'n/a');

const CLUSTER_TINTS = [
  'border-violet-200 bg-violet-50/80',
  'border-sky-200 bg-sky-50/80',
  'border-amber-200 bg-amber-50/80',
  'border-rose-200 bg-rose-50/80',
  'border-emerald-200 bg-emerald-50/80',
];

const formatIcwPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

const AdminDnaPanel: React.FC<AdminDnaPanelProps> = ({
  treeId,
  people = [],
  relationships = [],
  actor,
  onOpenPerson,
  onViewLineageInTree,
}) => {
  const [candidates, setCandidates] = useState<DNAAutosomalCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [personSearch, setPersonSearch] = useState('');
  const [matches, setMatches] = useState<DNASharedMatchRecord[]>([]);
  const [unlinkedMatches, setUnlinkedMatches] = useState<UnlinkedDnaMatchRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [placingMatchId, setPlacingMatchId] = useState<string | null>(null);
  const [dismissingMatchId, setDismissingMatchId] = useState<string | null>(null);
  const [rawKits, setRawKits] = useState<Awaited<ReturnType<typeof listAutosomalRawKitsForTree>>>([]);
  const [kitCompareA, setKitCompareA] = useState('');
  const [kitCompareB, setKitCompareB] = useState('');
  const [kitComparison, setKitComparison] = useState<ReturnType<typeof compareAutosomalMarkerIndices> | null>(null);
  const [comparingKits, setComparingKits] = useState(false);
  const [resolvingMatchId, setResolvingMatchId] = useState<string | null>(null);
  const [resolutionByMatchId, setResolutionByMatchId] = useState<Record<string, DnaLineageResolution>>({});
  const [expandedPathByMatchId, setExpandedPathByMatchId] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [minClusterCm, setMinClusterCm] = useState(7);
  const [strictIcw, setStrictIcw] = useState(true);
  const [selectedPaintMatchId, setSelectedPaintMatchId] = useState<string | null>(null);

  const matchById = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    people.forEach((person) => {
      map.set(person.id, `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.id);
    });
    return map;
  }, [people]);

  const lineageRelationshipRows = useMemo(
    () =>
      relationships.map((relationship) => ({
        id: relationship.id,
        person_id: relationship.personId,
        related_id: relationship.relatedId,
        type: relationship.type,
      })),
    [relationships]
  );

  const grandparentSlots = useMemo(
    () => (selectedPersonId ? resolveGrandparentSlots(selectedPersonId, relationships, peopleById) : []),
    [selectedPersonId, relationships, peopleById]
  );

  const segmentBackedMatches = useMemo(
    () => matches.filter((match) => (match.sharedSegmentsPreview?.length ?? 0) > 0),
    [matches]
  );

  const segmentsByMatchId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof segmentsFromPreview>>();
    segmentBackedMatches.forEach((match) => {
      if (match.sharedSegmentsPreview?.length) {
        map.set(match.id, segmentsFromPreview(match.sharedSegmentsPreview));
      }
    });
    return map;
  }, [segmentBackedMatches]);

  const minIcwOverlapFraction = strictIcw ? 0.5 : 0;

  const clusterGroups = useMemo(() => {
    if (!segmentBackedMatches.length) return [];
    return clusterSharedSegments(
      segmentBackedMatches.map((match) => ({
        matchId: match.id,
        segments: segmentsByMatchId.get(match.id) || [],
      })),
      { minCentimorgans: minClusterCm, minIcwOverlapFraction }
    );
  }, [segmentBackedMatches, segmentsByMatchId, minClusterCm, minIcwOverlapFraction]);

  const clusterSummaries = useMemo(
    () => clusterGroups.map((group) => summarizeClusterIcw(group, segmentsByMatchId, minIcwOverlapFraction)),
    [clusterGroups, segmentsByMatchId, minIcwOverlapFraction]
  );

  interface MatchLineageHints {
    parentalSide: ParentalSideHint;
    grandparentSlot: GrandparentSlot | null;
  }

  const matchLineageHints = useMemo(() => {
    const hints = new Map<string, MatchLineageHints>();
    if (!selectedPersonId) return hints;
    matches.forEach((match) => {
      const resolution = resolutionByMatchId[match.id];
      const pathPersonIds = resolution?.pathPersonIds?.length
        ? resolution.pathPersonIds
        : match.pathPersonIds;
      hints.set(match.id, {
        parentalSide: inferPathParentalSide(pathPersonIds, selectedPersonId, relationships),
        grandparentSlot: inferPathGrandparentSlot(pathPersonIds, grandparentSlots),
      });
    });
    return hints;
  }, [matches, resolutionByMatchId, selectedPersonId, relationships, grandparentSlots]);

  const clusteredMatchIds = useMemo(() => new Set(clusterGroups.flat()), [clusterGroups]);

  const overlapSingletons = useMemo(
    () => segmentBackedMatches.filter((match) => !clusteredMatchIds.has(match.id)),
    [segmentBackedMatches, clusteredMatchIds]
  );

  const clusterIndexByMatchId = useMemo(() => {
    const map = new Map<string, number>();
    clusterGroups.forEach((group, index) => {
      group.forEach((matchId) => map.set(matchId, index));
    });
    return map;
  }, [clusterGroups]);

  const paintInputs = useMemo((): PaintSegmentInput[] => {
    return segmentBackedMatches.map((match) => ({
      matchId: match.id,
      matchLabel: match.counterpartPersonName,
      clusterIndex: clusterIndexByMatchId.get(match.id) ?? null,
      segments: segmentsByMatchId.get(match.id) || [],
    }));
  }, [segmentBackedMatches, clusterIndexByMatchId, segmentsByMatchId]);

  const resolvePersonName = useCallback(
    (personId: string) => {
      const person = peopleById.get(personId);
      if (!person) return 'Unknown person';
      return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unknown person';
    },
    [peopleById]
  );

  const mrcaMatchInputs = useMemo((): MatchLineageInput[] => {
    return matches.map((match) => {
      const resolution = resolutionByMatchId[match.id];
      const pathPersonIds = resolution?.pathPersonIds?.length
        ? resolution.pathPersonIds
        : match.pathPersonIds;
      const pathRelationshipIds = resolution?.pathRelationshipIds?.length
        ? resolution.pathRelationshipIds
        : match.pathRelationshipIds;
      return {
        matchId: match.id,
        counterpartPersonId: match.counterpartPersonId,
        counterpartPersonName: match.counterpartPersonName,
        sharedCM: match.sharedCM,
        segments: match.segments,
        pathPersonIds,
        pathRelationshipIds,
        pathFound: pathPersonIds.length > 1 && pathRelationshipIds.length > 0,
        pathFitsPrediction: resolution?.pathFitsPrediction ?? match.pathFitsPrediction,
        clusterIndex: clusterIndexByMatchId.get(match.id) ?? null,
      };
    });
  }, [matches, resolutionByMatchId, clusterIndexByMatchId]);

  const mrcaCandidates = useMemo(() => {
    if (!selectedPersonId || !matches.length) return [];
    return suggestMrcaCandidates(selectedPersonId, mrcaMatchInputs, relationships, resolvePersonName, {
      clusterGroups: clusterGroups,
      minSupportingMatches: 1,
    });
  }, [selectedPersonId, matches.length, mrcaMatchInputs, relationships, resolvePersonName, clusterGroups]);

  const linkedMatchSegmentInputs = useMemo(
    () =>
      segmentBackedMatches.map((match) => ({
        matchId: match.id,
        counterpartName: match.counterpartPersonName,
        segments: segmentsByMatchId.get(match.id) || [],
      })),
    [segmentBackedMatches, segmentsByMatchId]
  );

  const placementByUnlinkedId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestUnknownMatchPlacements>>();
    unlinkedMatches.forEach((match) => {
      map.set(
        match.id,
        suggestUnknownMatchPlacements(
          {
            matchId: match.id,
            matchName: match.matchName,
            sharedCM: match.sharedCM,
            segments: match.segments,
            predictionLabel: match.predictionLabel,
            segmentsPreview: segmentsFromPreview(match.sharedSegmentsPreview || []),
          },
          {
            mrcaCandidates,
            linkedMatches: linkedMatchSegmentInputs,
            clusterGroups,
            minClusterCm,
            nameMatchCandidate: match.suggestedNameMatchPersonId
              ? {
                  personId: match.suggestedNameMatchPersonId,
                  personName: match.suggestedNameMatchPersonName || 'Unknown',
                  score: match.suggestedNameMatchScore || 0,
                }
              : null,
          }
        )
      );
    });
    return map;
  }, [unlinkedMatches, mrcaCandidates, linkedMatchSegmentInputs, clusterGroups, minClusterCm]);

  const handleCreateDnaMatchPerson = async (match: UnlinkedDnaMatchRecord) => {
    if (!treeId || !selectedPersonId || placingMatchId) return;
    setPlacingMatchId(match.id);
    setError(null);
    try {
      const result = await createDnaMatchPlaceholderPerson({
        treeId,
        focusPersonId: selectedPersonId,
        dnaTestId: match.dnaTestId,
        matchName: match.matchName,
        sharedCM: match.sharedCM,
        segments: match.segments,
        longestSegment: match.longestSegment,
        actor,
      });
      await loadMatches();
      await onOpenPerson?.(result.personId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create DNA match person.');
    } finally {
      setPlacingMatchId(null);
    }
  };

  const handleLinkUnlinkedToPerson = async (match: UnlinkedDnaMatchRecord, targetPersonId: string) => {
    if (!treeId || !selectedPersonId || placingMatchId) return;
    setPlacingMatchId(match.id);
    setError(null);
    try {
      await linkUnlinkedDnaTestToPerson({
        treeId,
        focusPersonId: selectedPersonId,
        dnaTestId: match.dnaTestId,
        targetPersonId,
        matchName: match.matchName,
        sharedCM: match.sharedCM,
        segments: match.segments,
        longestSegment: match.longestSegment,
      });
      await loadMatches();
      await onOpenPerson?.(targetPersonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link DNA test to person.');
    } finally {
      setPlacingMatchId(null);
    }
  };

  const handleDismissUnlinkedMatch = async (match: UnlinkedDnaMatchRecord) => {
    if (!selectedPersonId || dismissingMatchId || placingMatchId) return;
    setDismissingMatchId(match.id);
    setError(null);
    try {
      await dismissUnlinkedDnaMatchForFocus({
        dnaTestId: match.dnaTestId,
        focusPersonId: selectedPersonId,
      });
      setUnlinkedMatches((current) => current.filter((item) => item.id !== match.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss unknown match.');
    } finally {
      setDismissingMatchId(null);
    }
  };

  const handleCompareRawKits = async () => {
    const kitA = rawKits.find((kit) => kit.testId === kitCompareA);
    const kitB = rawKits.find((kit) => kit.testId === kitCompareB);
    const key = resolveDnaEncryptionKey();
    if (!kitA || !kitB || !key || !kitA.encryptedRawPayload || !kitB.encryptedRawPayload) {
      setKitComparison(null);
      return;
    }
    setComparingKits(true);
    setError(null);
    try {
      const [plainA, plainB] = await Promise.all([
        decryptRawPayload(kitA.encryptedRawPayload, key),
        decryptRawPayload(kitB.encryptedRawPayload, key),
      ]);
      const indexA = deserializeMarkerIndex(plainA, kitA.rawMarkerIndexStats);
      const indexB = deserializeMarkerIndex(plainB, kitB.rawMarkerIndexStats);
      setKitComparison(compareAutosomalMarkerIndices(indexA, indexB));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare encrypted raw kits.');
      setKitComparison(null);
    } finally {
      setComparingKits(false);
    }
  };

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
      setUnlinkedMatches([]);
      return;
    }
    setLoadingMatches(true);
    setError(null);
    try {
      const [rows, unlinked] = await Promise.all([
        listSharedMatchesForAutosomalPerson(treeId, selectedPersonId),
        listUnlinkedSharedMatchesForAutosomalPerson(treeId, selectedPersonId),
      ]);
      setMatches(rows);
      setUnlinkedMatches(unlinked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared autosomal matches.');
      setMatches([]);
      setUnlinkedMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [treeId, selectedPersonId]);

  useEffect(() => {
    setResolutionByMatchId({});
    setExpandedPathByMatchId({});
    setMatches([]);
    setUnlinkedMatches([]);
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

  useEffect(() => {
    if (!treeId) {
      setRawKits([]);
      return;
    }
    listAutosomalRawKitsForTree(treeId)
      .then(setRawKits)
      .catch(() => setRawKits([]));
  }, [treeId, matches.length, unlinkedMatches.length]);

  const [resolvingAll, setResolvingAll] = useState(false);
  const [resolveAllProgress, setResolveAllProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // Resolve every loaded shared-autosomal match for the selected person, one at a time, so the
  // dna_support_by_person annotations (and thus the pedigree DNA badges) repopulate in one action.
  // Continues past individual failures and reports a summary.
  const handleResolveAllLineages = async () => {
    if (!treeId || !selectedPersonId || resolvingAll || matches.length === 0) return;
    setResolvingAll(true);
    setError(null);
    setResolveAllProgress({ done: 0, total: matches.length });
    let resolved = 0;
    let failed = 0;
    try {
      const pathRelationships = await loadDnaPathRelationshipsForTree(treeId);
      const resolveOptions = { pathRelationships };
      for (const match of matches) {
        try {
          const resolution =
            match.source === 'dna_match'
              ? await resolveSharedMatchLineage(
                  treeId,
                  selectedPersonId,
                  match.dnaMatchId || match.id,
                  actor,
                  resolveOptions
                )
              : match.source === 'family_kit'
              ? await resolveFamilyKitLineage(
                  treeId,
                  selectedPersonId,
                  match.dnaTestId || match.id.replace(/^family-kit:/, ''),
                  match.counterpartPersonId,
                  match.familyRelationLabel || 'Family member',
                  actor,
                  resolveOptions
                )
              : await resolveSharedTestLineage(
                  treeId,
                  selectedPersonId,
                  match.dnaTestId || match.id.replace(/^test:/, ''),
                  match.counterpartPersonId,
                  actor,
                  resolveOptions
                );
          setResolutionByMatchId((prev) => ({ ...prev, [match.id]: resolution }));
          window.dispatchEvent(
            new CustomEvent('linegra:dna-lineage-resolved', {
              detail: {
                dnaTestId: match.dnaTestId || null,
                pathPersonIds: resolution.pathPersonIds,
                pathRelationshipIds: resolution.pathRelationshipIds,
              },
            })
          );
          resolved += 1;
        } catch {
          failed += 1;
        }
        setResolveAllProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
      await loadMatches();
      if (failed > 0) {
        setError(
          `Resolved ${resolved} of ${matches.length} match${matches.length === 1 ? '' : 'es'}; ${failed} could not be linked.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve all lineages.');
    } finally {
      setResolvingAll(false);
    }
  };

  const handleResolveLineage = async (matchId: string) => {
    if (!treeId || !selectedPersonId || resolvingMatchId) return;
    setResolvingMatchId(matchId);
    setError(null);
    try {
      const match = matches.find((item) => item.id === matchId);
      if (!match) {
        throw new Error('Selected DNA match is no longer available.');
      }
      const pathRelationships = await loadDnaPathRelationshipsForTree(treeId);
      const resolveOptions = { pathRelationships };
      const resolution =
        match.source === 'dna_match'
          ? await resolveSharedMatchLineage(
              treeId,
              selectedPersonId,
              match.dnaMatchId || match.id,
              actor,
              resolveOptions
            )
          : match.source === 'family_kit'
          ? await resolveFamilyKitLineage(
              treeId,
              selectedPersonId,
              match.dnaTestId || match.id.replace(/^family-kit:/, ''),
              match.counterpartPersonId,
              match.familyRelationLabel || 'Family member',
              actor,
              resolveOptions
            )
          : await resolveSharedTestLineage(
              treeId,
              selectedPersonId,
              match.dnaTestId || match.id.replace(/^test:/, ''),
              match.counterpartPersonId,
              actor,
              resolveOptions
            );
      setResolutionByMatchId((prev) => ({ ...prev, [matchId]: resolution }));
      setExpandedPathByMatchId((prev) => ({ ...prev, [matchId]: true }));
      window.dispatchEvent(
        new CustomEvent('linegra:dna-lineage-resolved', {
          detail: {
            dnaTestId: match.dnaTestId || null,
            pathPersonIds: resolution.pathPersonIds,
            pathRelationshipIds: resolution.pathRelationshipIds,
          },
        })
      );
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
            Pick a person with an Autosomal test, inspect shared autosomal matches and in-tree family kits in this
            tree, and run lineage path resolution. Shared-segment CSV imports provide cM data; relatives with raw
            autosomal uploads appear as family kits when they are linked in the tree.
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
                  <button
                    type="button"
                    onClick={() => onOpenPerson?.(selectedCandidate.personId)}
                    className="w-full text-left rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected</p>
                    <p className="font-bold text-slate-900">{selectedCandidate.name}</p>
                    <p className="text-xs text-slate-500">{formatVitals(selectedCandidate.birthYear, selectedCandidate.deathYear)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Autosomal tests: <span className="font-bold text-slate-700">{selectedCandidate.autosomalTestCount}</span>
                    </p>
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Shared autosomal matches</p>
                <div className="flex items-center gap-3">
                  {resolvingAll && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      Resolving {resolveAllProgress.done}/{resolveAllProgress.total}…
                    </span>
                  )}
                  {loadingMatches && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                  <button
                    type="button"
                    onClick={handleResolveAllLineages}
                    disabled={resolvingAll || matches.length === 0 || !!resolvingMatchId}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolvingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {resolvingAll ? 'Resolving…' : 'Resolve all matches'}
                  </button>
                </div>
              </div>
              {!selectedPersonId ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Select a person to load matches.
                </div>
              ) : matches.length === 0 && !loadingMatches ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 space-y-2">
                  <p>No shared autosomal matches or in-tree family kits found for this person.</p>
                  <p className="text-xs text-slate-400">
                    Import a <span className="font-semibold">Shared DNA CSV</span> (segment comparison export) on
                    this person or a match profile for cM-based matches. Relatives with a documented tree link and a
                    raw Autosomal upload (e.g. a parent&apos;s AncestryDNA file) appear here as family kits.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {matches.map((match) => {
                    const resolution = resolutionByMatchId[match.id];
                    const isPathExpanded = !!expandedPathByMatchId[match.id];
                    const pathPersonIds = resolution?.pathPersonIds?.length
                      ? resolution.pathPersonIds
                      : match.pathPersonIds;
                    const pathRelationshipIds = resolution?.pathRelationshipIds?.length
                      ? resolution.pathRelationshipIds
                      : match.pathRelationshipIds;
                    const pathNames = new Map(personNameById);
                    pathNames.set(match.counterpartPersonId, match.counterpartPersonName);
                    if (selectedPersonId) {
                      const focusName = personNameById.get(selectedPersonId);
                      if (focusName) pathNames.set(selectedPersonId, focusName);
                    }
                    const lineageBreadcrumb =
                      match.pathFound && pathPersonIds.length
                        ? buildDnaLineagePathBreadcrumb(
                            pathPersonIds,
                            pathRelationshipIds,
                            lineageRelationshipRows,
                            pathNames
                          )
                        : [];
                    const pathSummary =
                      match.pathFound && pathPersonIds.length
                        ? formatDnaLineagePathSummary(
                            pathPersonIds,
                            pathRelationshipIds,
                            lineageRelationshipRows,
                            pathNames
                          )
                        : 'No linked lineage path';
                    const mrcaPersonId =
                      match.pathFound && pathPersonIds.length
                        ? pickLineageMrcaPersonId(pathPersonIds, pathRelationshipIds, lineageRelationshipRows)
                        : null;
                    const viewInTreePersonId = mrcaPersonId || selectedPersonId;
                    return (
                      <div
                        key={match.id}
                        onClick={() => onOpenPerson?.(match.counterpartPersonId)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          onOpenPerson?.(match.counterpartPersonId);
                        }}
                        role="button"
                        tabIndex={0}
                        className="w-full text-left rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{match.counterpartPersonName}</p>
                            {match.source === 'family_kit' && match.familyRelationLabel && (
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mt-0.5">
                                {match.familyRelationLabel} · family kit
                              </p>
                            )}
                            <p className="text-xs text-slate-500">
                              Test owner:{' '}
                              <span
                                role="link"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenPerson?.(match.ownerPersonId);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onOpenPerson?.(match.ownerPersonId);
                                }}
                                className="underline decoration-dotted underline-offset-2 cursor-pointer"
                              >
                                {match.ownerPersonName}
                              </span>
                            </p>
                            {match.fileName && (
                              <p className="text-xs text-slate-400 truncate max-w-[440px]">File: {match.fileName}</p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolveLineage(match.id);
                            }}
                            disabled={resolvingMatchId === match.id || resolvingAll}
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
                                ? match.source === 'family_kit'
                                  ? 'Path linked (documented family, no segment cM)'
                                  : 'Path linked + cM compatible (blood line)'
                                : 'Blood path found but cM does not fit prediction'
                              : 'No ancestral blood or sibling path'}
                          </span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!resolution && match.pathFound && !resolvingMatchId) {
                                await handleResolveLineage(match.id);
                                return;
                              }
                              setExpandedPathByMatchId((prev) => ({ ...prev, [match.id]: !prev[match.id] }));
                            }}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isPathExpanded ? 'Hide lineage' : pathSummary}
                          </button>
                        </div>
                        {isPathExpanded && lineageBreadcrumb.length > 0 && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 space-y-2">
                            <DnaLineagePathBreadcrumb nodes={lineageBreadcrumb} className="text-xs" />
                            {viewInTreePersonId && onViewLineageInTree ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onViewLineageInTree(viewInTreePersonId);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-blue-800 hover:bg-blue-100"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                View in tree
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {treeId && selectedPersonId && unlinkedMatches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-5">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Unknown matches</p>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-1">Placement suggestions (K3)</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Shared-segment imports with no linked person row. Review suggested placement, link to an existing
              person, or create a DNA match placeholder to attach the test in-tree.
            </p>
          </div>
          <div className="space-y-4">
            {unlinkedMatches.map((match) => {
              const suggestions = placementByUnlinkedId.get(match.id) || [];
              const displaySuggestions = suggestions.filter((item) => item.kind !== 'unplaced');
              const linkSuggestion = suggestions.find((item) => item.kind === 'link_existing');
              const linkTargetPersonId =
                linkSuggestion?.anchorPersonId || match.suggestedNameMatchPersonId || null;
              const linkTargetPersonName =
                linkSuggestion?.anchorPersonName || match.suggestedNameMatchPersonName || null;
              const isPlacing = placingMatchId === match.id;
              const isDismissing = dismissingMatchId === match.id;
              const isBusy = isPlacing || isDismissing;
              return (
                <div
                  key={match.id}
                  className="rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{match.matchName}</p>
                      <p className="text-xs text-slate-500">
                        {formatCm(match.sharedCM)} · {match.segments ?? 'n/a'} segments · {match.predictionLabel}
                      </p>
                      {match.fileName && <p className="text-xs text-slate-400 truncate max-w-xl">{match.fileName}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {linkTargetPersonId && linkTargetPersonName && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleLinkUnlinkedToPerson(match, linkTargetPersonId)}
                          className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          Link to {linkTargetPersonName}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleCreateDnaMatchPerson(match)}
                        className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {isPlacing ? 'Placing…' : 'Create match person'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDismissUnlinkedMatch(match)}
                        className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        {isDismissing ? 'Dismissing…' : 'Not in my tree'}
                      </button>
                    </div>
                  </div>
                  {displaySuggestions.length > 0 && (
                    <ul className="text-xs text-slate-600 space-y-2">
                      {displaySuggestions.slice(0, 4).map((suggestion, index) => (
                        <li
                          key={`${match.id}-suggestion-${index}`}
                          className={
                            index === 0
                              ? 'rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-slate-800'
                              : 'px-1'
                          }
                        >
                          {index === 0 && (
                            <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-blue-700 mb-1">
                              Top suggestion
                            </span>
                          )}
                          {suggestion.anchorPersonName ? (
                            <button
                              type="button"
                              className="font-semibold underline decoration-dotted underline-offset-2 hover:text-blue-700"
                              onClick={() =>
                                suggestion.anchorPersonId && onOpenPerson?.(suggestion.anchorPersonId)
                              }
                            >
                              {suggestion.anchorPersonName}
                            </button>
                          ) : (
                            <span className="font-semibold">{suggestion.relationshipLabel}</span>
                          )}
                          {' — '}
                          {suggestion.rationale}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {treeId && selectedPersonId && (
        <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Segment clusters</p>
              <h3 className="text-xl font-serif font-bold text-slate-900 mt-1">Overlap groups (Leeds-style)</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-3xl">
                Matches imported with shared-segment CSV rows are grouped when their owner-side segments overlap.
                Enable strict ICW to require ~50% reciprocal overlap (reduces false clusters on unphased data).
                Parental / grandparent labels come from documented lineage paths when available.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={strictIcw}
                  onChange={(e) => setStrictIcw(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">Strict ICW (50%)</span>
              </label>
              <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400" htmlFor="min-cluster-cm">
                Min segment cM
              </label>
              <input
                id="min-cluster-cm"
                type="number"
                min={0}
                step={1}
                value={minClusterCm}
                onChange={(e) => setMinClusterCm(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700"
              />
              </div>
            </div>
          </div>

          {grandparentSlots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {grandparentSlots.map((slot) => (
                <span
                  key={slot.key}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {grandparentSlotShortLabel(slot.key)}: {slot.label}
                </span>
              ))}
            </div>
          )}

          {segmentBackedMatches.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              No matches with imported segment rows for this tester. Import shared-segment CSVs on the profile DNA tab
              to enable clustering.
            </div>
          ) : clusterGroups.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {segmentBackedMatches.length} match(es) have segment data, but none overlap above {minClusterCm} cM.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clusterGroups.map((group, index) => {
                const tint = CLUSTER_TINTS[index % CLUSTER_TINTS.length];
                const summary = clusterSummaries[index];
                const slotVotes = new Map<string, number>();
                group.forEach((matchId) => {
                  const slot = matchLineageHints.get(matchId)?.grandparentSlot;
                  if (slot) slotVotes.set(slot.key, (slotVotes.get(slot.key) || 0) + 1);
                });
                const dominantSlotKey = [...slotVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                const dominantSlot = grandparentSlots.find((slot) => slot.key === dominantSlotKey) || null;
                return (
                  <div key={`cluster-${index}`} className={`rounded-2xl border px-4 py-4 space-y-3 ${tint}`}>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-600" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                        Cluster {index + 1} · {group.length} matches
                      </p>
                    </div>
                    {summary && (
                      <p className="text-xs text-slate-600">
                        Avg ICW overlap: <span className="font-semibold">{formatIcwPercent(summary.avgIcwFraction)}</span>
                        {strictIcw && (
                          <>
                            {' '}
                            · {summary.icwConfirmedPairs}/{summary.totalPairs} pairs ≥50%
                          </>
                        )}
                      </p>
                    )}
                    {dominantSlot && (
                      <p className="text-xs text-slate-600">
                        Leeds hint: <span className="font-semibold">{grandparentSlotShortLabel(dominantSlot.key)}</span>
                        {' — '}
                        {dominantSlot.label}
                      </p>
                    )}
                    <ul className="space-y-2">
                      {group.map((matchId) => {
                        const match = matchById.get(matchId);
                        if (!match) return null;
                        const hints = matchLineageHints.get(matchId);
                        return (
                          <li
                            key={matchId}
                            className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-800"
                          >
                            <span className="font-semibold">{match.counterpartPersonName}</span>
                            <span className="text-slate-500"> · {formatCm(match.sharedCM)}</span>
                            <span className="text-slate-400 text-xs block">
                              {match.sharedSegmentsPreview?.length ?? 0} segment rows
                              {hints && hints.parentalSide !== 'unknown' && (
                                <> · {hints.parentalSide === 'maternal' ? 'Maternal line' : 'Paternal line'}</>
                              )}
                              {hints?.grandparentSlot && (
                                <> · {grandparentSlotShortLabel(hints.grandparentSlot.key)}</>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {overlapSingletons.length > 0 && (
            <p className="text-xs text-slate-500">
              {overlapSingletons.length} match(es) with segment data did not overlap any other match at this threshold.
            </p>
          )}
        </div>
      )}

      {treeId && selectedPersonId && mrcaCandidates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-5">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">MRCA analysis</p>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-1">Suggested common ancestors</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Candidates ranked by how many shared matches point to the same ancestor, combined shared cM,
              cluster overlap, and lineage-path convergence. Resolve match lineages first for best results.
            </p>
          </div>
          <div className="space-y-3">
            {mrcaCandidates.slice(0, 10).map((candidate, index) => (
              <div
                key={candidate.ancestorPersonId}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => onOpenPerson?.(candidate.ancestorPersonId)}
                      className="text-sm font-bold text-slate-900 hover:text-blue-700 underline decoration-dotted underline-offset-2"
                    >
                      {index + 1}. {candidate.ancestorName}
                    </button>
                    <p className="text-xs text-slate-500 mt-1">
                      Likely MRCA for{' '}
                      <span className="font-semibold text-slate-700">{candidate.primaryRelationshipLabel}</span>
                      {' · '}
                      {candidate.supportingMatchIds.length} match
                      {candidate.supportingMatchIds.length === 1 ? '' : 'es'}
                      {candidate.totalSharedCm > 0 && (
                        <>
                          {' '}
                          · {candidate.totalSharedCm.toFixed(1)} cM combined
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {candidate.clusterIndices.length > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700">
                        Clusters {candidate.clusterIndices.map((i) => i + 1).join(', ')}
                      </span>
                    )}
                    {candidate.pathConvergenceCount >= 2 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                        Path convergence ×{candidate.pathConvergenceCount}
                      </span>
                    )}
                    {candidate.cmCompatibleCount > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
                        cM fit {candidate.cmCompatibleCount}/{candidate.supportingMatchIds.length}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  Matches: {candidate.supportingMatchNames.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {treeId && selectedPersonId && segmentBackedMatches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-5">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Chromosome map</p>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-1">Segment painter</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Shared segments positioned on each chromosome, colored by overlap cluster. Gray segments belong to
              matches that did not cluster at the current threshold. Click a segment to highlight the match.
            </p>
          </div>

          {clusterGroups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {clusterGroups.map((group, index) => {
                const tint = CLUSTER_TINTS[index % CLUSTER_TINTS.length];
                return (
                  <span
                    key={`legend-${index}`}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${tint}`}
                  >
                    Cluster {index + 1} · {group.length}
                  </span>
                );
              })}
              {overlapSingletons.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-600">
                  Unclustered · {overlapSingletons.length}
                </span>
              )}
            </div>
          )}

          <DnaSegmentPainterView
            inputs={paintInputs}
            minCentimorgans={minClusterCm}
            selectedMatchId={selectedPaintMatchId}
            onSelectMatch={(matchId) => {
              setSelectedPaintMatchId((current) => (current === matchId ? null : matchId));
              const counterpartId = matchById.get(matchId)?.counterpartPersonId;
              if (counterpartId) onOpenPerson?.(counterpartId);
            }}
          />

          {selectedPaintMatchId && matchById.get(selectedPaintMatchId) && (
            <p className="text-xs text-slate-600">
              Selected:{' '}
              <span className="font-semibold">{matchById.get(selectedPaintMatchId)?.counterpartPersonName}</span>
              {clusterIndexByMatchId.has(selectedPaintMatchId) && (
                <> · cluster {clusterIndexByMatchId.get(selectedPaintMatchId)! + 1}</>
              )}
            </p>
          )}
        </div>
      )}

      {treeId && rawKits.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-5">
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Raw kit comparison</p>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-1">Encrypted autosomal overlap (K6)</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Compare SNP overlap between testers who imported raw autosomal data with encrypted-index consent.
              Requires <code className="text-xs bg-slate-100 px-1 rounded">VITE_DNA_ENCRYPTION_KEY</code>.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={kitCompareA}
              onChange={(e) => setKitCompareA(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            >
              <option value="">Select kit A</option>
              {rawKits.map((kit) => (
                <option key={`a-${kit.testId}`} value={kit.testId}>
                  {kit.personName}
                </option>
              ))}
            </select>
            <select
              value={kitCompareB}
              onChange={(e) => setKitCompareB(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            >
              <option value="">Select kit B</option>
              {rawKits.map((kit) => (
                <option key={`b-${kit.testId}`} value={kit.testId}>
                  {kit.personName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!kitCompareA || !kitCompareB || kitCompareA === kitCompareB || comparingKits || !canStoreEncryptedRawDna()}
            onClick={handleCompareRawKits}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] disabled:opacity-50"
          >
            {comparingKits ? 'Comparing…' : 'Compare encrypted kits'}
          </button>
          {kitComparison && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 space-y-1">
              <p>
                Shared SNPs: <span className="font-bold">{kitComparison.sharedSnps.toLocaleString()}</span>
              </p>
              <p>
                Half-identical: <span className="font-bold">{kitComparison.halfIdenticalSnps.toLocaleString()}</span>
                {' · '}
                Mismatches: <span className="font-bold">{kitComparison.mismatches.toLocaleString()}</span>
              </p>
              <p>
                Overlap rate: <span className="font-bold">{(kitComparison.overlapRate * 100).toFixed(2)}%</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDnaPanel;
