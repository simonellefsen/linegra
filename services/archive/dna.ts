import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { deriveMatchConfidence, relationshipPredictionLabel, supportsRelationshipHops } from '../../lib/dnaClassification';
import { extractComparisonNamesFromFileName } from '../../lib/dnaRawParser';
import {
  DNA_BLOOD_PATH_RELATIONSHIP_TYPES,
  buildChildToParentsMap,
  findDnaBloodRelationshipPath,
  pathHasCoparentBridge,
} from '../../lib/dnaLineagePath';
import { buildDnaLineagePathLabel } from '../../lib/dnaLineagePathLabel';
import { parseMatchDisplayName } from '../../lib/dnaMatchPlacement';
import { isK3DismissedForFocus, withK3DismissedForFocus } from '../../lib/dnaK3Dismiss';
import { normalizeNameMatchScore, scoreNameMatch } from '../../lib/dnaNameMatch';
import {
  bestPersonNameMatchScore,
  mapDbRowToNameLookup,
} from '../../lib/dnaPersonNameVariants';
import {
  inferCounterpartDisplayName,
  sharedTestAppliesToFocusPerson,
} from '../../lib/dnaSharedImportOwner';
import {
  AutosomalIndexStats,
  DNAAutosomalCandidate,
  DnaLineageResolution,
  DNASharedMatchRecord,
  DNASharedSegmentRowPreview,
  DNATest,
  Person,
  RelationshipType,
  UnlinkedDnaMatchRecord,
} from '../../types';
import { mapDbPerson } from '../../lib/archiveDbMappers';
import { normalizeActor, parseRpcJsonPage, randomId, UUID_REGEX, type ImportActor } from './shared';

export interface NameLookupRow {
  id: string;
  first_name: string;
  last_name: string | null;
  maiden_name: string | null;
  alternate_names?: Array<{
    type?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  }>;
}

interface RelationshipLookupRow {
  id: string;
  person_id: string;
  related_id: string;
  type?: RelationshipType;
  metadata?: Record<string, unknown> | null;
}

export interface DnaMatchPayloadItem {
  matched_person_id: string;
  shared_cm: number;
  segments: number;
  longest_segment: number | null;
  confidence: 'High' | 'Medium' | 'Low';
  metadata: Record<string, unknown>;
  path_person_ids: string[];
  path_relationship_ids: string[];
}

interface SharedSegmentSummaryLike {
  source?: string;
  personName: string;
  matchName: string;
  segmentCount: number;
  totalCentimorgans: number;
  largestSegmentCentimorgans: number;
  fileName?: string;
  importedAt?: string;
}

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const resolvePersonIdByName = (
  rawName: string | null | undefined,
  candidates: NameLookupRow[],
  excludedPersonId?: string
) => {
  const input = normalizeName(rawName);
  if (!input) return null;

  const ranked = candidates
    .filter((candidate) => !(excludedPersonId && candidate.id === excludedPersonId))
    .map((candidate) => ({
      id: candidate.id,
      score: bestPersonNameMatchScore(input, candidate),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const secondBest = ranked[1];
  if (!best || normalizeNameMatchScore(best.score) < 60) return null;
  if (secondBest && best.score - secondBest.score < 5) return null;
  return best.id;
};

const findBestNameMatch = (
  rawName: string | null | undefined,
  candidates: NameLookupRow[],
  excludedPersonId?: string
): { id: string; score: number; displayName: string } | null => {
  const input = normalizeName(rawName);
  if (!input) return null;

  const ranked = candidates
    .filter((candidate) => !(excludedPersonId && candidate.id === excludedPersonId))
    .map((candidate) => {
      const displayName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
      return {
        id: candidate.id,
        displayName,
        score: bestPersonNameMatchScore(input, candidate),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || normalizeNameMatchScore(best.score) < 40) return null;
  return best;
};

export const extractYear = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

export const toDisplayName = (row?: { first_name?: string | null; last_name?: string | null } | null) =>
  `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || 'Unknown';

const toNumberOrNull = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const ensureStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : [];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const buildFullName = (firstName?: string | null, lastName?: string | null) =>
  `${firstName || ''} ${lastName || ''}`.trim();

const rawAutosomalFileNameFromMetadata = (metadata: Record<string, unknown>): string | undefined => {
  const raw = asRecord(metadata.rawDataSummary ?? metadata.raw_data_summary);
  if (typeof raw.fileName === 'string') return raw.fileName;
  if (typeof raw.file_name === 'string') return raw.file_name;
  return undefined;
};

const rawAutosomalImportedAtFromMetadata = (metadata: Record<string, unknown>): string | undefined => {
  const raw = asRecord(metadata.rawDataSummary ?? metadata.raw_data_summary);
  if (typeof raw.importedAt === 'string') return raw.importedAt;
  if (typeof raw.imported_at === 'string') return raw.imported_at;
  return undefined;
};

const familyKitPredictionLabel = (relationLabel: string) => `In-tree family kit (${relationLabel})`;

const summaryFromDnaTestMetadata = (metadata: Record<string, unknown>): SharedSegmentSummaryLike | null => {
  const summaryRaw = asRecord(metadata.sharedSegmentSummary ?? metadata.shared_segment_summary);
  const personName = typeof summaryRaw.personName === 'string'
    ? summaryRaw.personName
    : typeof summaryRaw.person_name === 'string'
    ? summaryRaw.person_name
    : '';
  const matchName = typeof summaryRaw.matchName === 'string'
    ? summaryRaw.matchName
    : typeof summaryRaw.match_name === 'string'
    ? summaryRaw.match_name
    : '';
  const segmentCount = toNumberOrNull(summaryRaw.segmentCount ?? summaryRaw.segment_count);
  const totalCentimorgans = toNumberOrNull(summaryRaw.totalCentimorgans ?? summaryRaw.total_centimorgans);
  const largestSegmentCentimorgans = toNumberOrNull(
    summaryRaw.largestSegmentCentimorgans ?? summaryRaw.largest_segment_centimorgans
  );
  const fileName = typeof summaryRaw.fileName === 'string'
    ? summaryRaw.fileName
    : typeof summaryRaw.file_name === 'string'
    ? summaryRaw.file_name
    : undefined;
  if (!personName && !matchName) return null;
  if (segmentCount == null || totalCentimorgans == null || largestSegmentCentimorgans == null) return null;
  const importFormat =
    typeof summaryRaw.importFormat === 'string'
      ? summaryRaw.importFormat
      : typeof summaryRaw.import_format === 'string'
      ? summaryRaw.import_format
      : undefined;
  const isFtdnaComparison = importFormat === 'FTDNA_COMPARISON_SEGMENTS';
  const resolvedNames = fileName
    ? (() => {
        const fromFile = extractComparisonNamesFromFileName(fileName);
        if (!fromFile) return { personName, matchName };
        const [firstName, secondName] = fromFile;
        let nextPersonName = personName;
        let nextMatchName = matchName;
        if (!nextPersonName || nextPersonName === 'Unknown') {
          if (isFtdnaComparison && nextMatchName && nextMatchName !== 'Unknown') {
            const normalize = (value: string) =>
              value
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const matchNorm = normalize(nextMatchName);
            const secondNorm = normalize(secondName);
            nextPersonName =
              matchNorm === secondNorm || matchNorm.includes(secondNorm) || secondNorm.includes(matchNorm)
                ? firstName
                : secondName;
          } else {
            nextPersonName = firstName;
          }
        }
        if (!nextMatchName || nextMatchName === 'Unknown') {
          nextMatchName = secondName;
        }
        return { personName: nextPersonName, matchName: nextMatchName };
      })()
    : { personName, matchName };
  return {
    source: typeof summaryRaw.source === 'string' ? summaryRaw.source : undefined,
    personName: resolvedNames.personName,
    matchName: resolvedNames.matchName,
    segmentCount,
    totalCentimorgans,
    largestSegmentCentimorgans,
    fileName,
    importedAt: typeof summaryRaw.importedAt === 'string'
      ? summaryRaw.importedAt
      : typeof summaryRaw.imported_at === 'string'
      ? summaryRaw.imported_at
      : undefined,
  };
};

const sharedSegmentsPreviewFromMetadata = (
  metadata: Record<string, unknown>
): DNASharedSegmentRowPreview[] | undefined => {
  const raw = metadata.sharedSegmentsPreview ?? metadata.shared_segments_preview;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const rows: DNASharedSegmentRowPreview[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const chromosome = row.chromosome;
    const startLocation = toNumberOrNull(row.startLocation ?? row.start_location);
    const endLocation = toNumberOrNull(row.endLocation ?? row.end_location);
    if (typeof chromosome !== 'string' && typeof chromosome !== 'number') continue;
    if (startLocation == null || endLocation == null) continue;
    rows.push({
      chromosome: String(chromosome),
      startLocation,
      endLocation,
      startRsid: typeof row.startRsid === 'string' ? row.startRsid : typeof row.start_rsid === 'string' ? row.start_rsid : '',
      endRsid: typeof row.endRsid === 'string' ? row.endRsid : typeof row.end_rsid === 'string' ? row.end_rsid : '',
      centimorgans: toNumberOrNull(row.centimorgans) ?? 0,
      snps: toNumberOrNull(row.snps) ?? 0,
    });
  }
  return rows.length ? rows : undefined;
};

const focusIsSharedMatchParty = (
  focusPersonId: string,
  focusFullName: string,
  summary: SharedSegmentSummaryLike,
  nameRows: NameLookupRow[],
  sharedPersonId: string | null,
  sharedMatchPersonId: string | null,
  ownerPersonId: string | null = null
) => {
  if (sharedTestAppliesToFocusPerson(focusPersonId, ownerPersonId, sharedPersonId, sharedMatchPersonId)) {
    return true;
  }
  const personNameId = resolvePersonIdByName(summary.personName, nameRows);
  const matchNameId = resolvePersonIdByName(summary.matchName, nameRows);
  if (personNameId && matchNameId) {
    return personNameId === focusPersonId || matchNameId === focusPersonId;
  }
  const namedComparison =
    (summary.personName && summary.personName !== 'Unknown') ||
    (summary.matchName && summary.matchName !== 'Unknown');
  if (summary.fileName) {
    const fileNames = extractComparisonNamesFromFileName(summary.fileName);
    if (fileNames) {
      const [firstName, secondName] = fileNames;
      const firstId = resolvePersonIdByName(firstName, nameRows);
      const secondId = resolvePersonIdByName(secondName, nameRows);
      if (firstId && secondId) {
        return firstId === focusPersonId || secondId === focusPersonId;
      }
      if (scoreNameMatch(focusFullName, firstName) >= 60) return true;
      if (scoreNameMatch(focusFullName, secondName) >= 60) return true;
      if (namedComparison) return false;
    }
  }
  if (namedComparison) {
    if (scoreNameMatch(focusFullName, summary.personName) >= 60) return true;
    if (scoreNameMatch(focusFullName, summary.matchName) >= 60) return true;
    return false;
  }
  if (personNameId === focusPersonId || matchNameId === focusPersonId) {
    return true;
  }
  if (scoreNameMatch(focusFullName, summary.personName) >= 60) return true;
  if (scoreNameMatch(focusFullName, summary.matchName) >= 60) return true;
  if (sharedPersonId === focusPersonId || sharedMatchPersonId === focusPersonId) {
    return true;
  }
  return false;
};

const resolveCounterpartFromSummaryNames = (
  focusPersonId: string,
  summary: SharedSegmentSummaryLike,
  nameRows: NameLookupRow[]
) => {
  const personNameId = resolvePersonIdByName(summary.personName, nameRows);
  const matchNameId = resolvePersonIdByName(summary.matchName, nameRows);
  if (personNameId === focusPersonId && matchNameId && matchNameId !== focusPersonId) {
    return matchNameId;
  }
  if (matchNameId === focusPersonId && personNameId && personNameId !== focusPersonId) {
    return personNameId;
  }
  return null;
};

const pathUsesBloodRelationships = (
  pathRelationshipIds: string[],
  relationshipRows: RelationshipLookupRow[]
) => {
  if (!pathRelationshipIds.length) return false;
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  return pathRelationshipIds.every((relationshipId) =>
    DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(relationshipById.get(relationshipId)?.type || '')
  );
};

const computePathFitsPrediction = (
  pathFound: boolean,
  pathPersonIds: string[],
  pathRelationshipIds: string[],
  relationshipRows: RelationshipLookupRow[],
  sharedCM: number | null
) => {
  if (!pathFound || pathPersonIds.length < 2) return false;
  const childToParents = buildChildToParentsMap(relationshipRows);
  return (
    pathUsesBloodRelationships(pathRelationshipIds, relationshipRows) &&
    !pathHasCoparentBridge(pathPersonIds, childToParents) &&
    supportsRelationshipHops(sharedCM, pathRelationshipIds.length)
  );
};

const inferCounterpartForFocus = (
  focusPersonId: string,
  ownerPersonId: string,
  summary: SharedSegmentSummaryLike,
  nameRows: NameLookupRow[],
  focusFullName: string
) => {
  const personNameId = resolvePersonIdByName(summary.personName, nameRows);
  const matchNameId = resolvePersonIdByName(summary.matchName, nameRows);
  if (ownerPersonId === focusPersonId) {
    if (personNameId && personNameId !== focusPersonId) return personNameId;
    if (matchNameId && matchNameId !== focusPersonId) return matchNameId;
  } else {
    if (personNameId === focusPersonId && matchNameId && matchNameId !== focusPersonId) return matchNameId;
    if (matchNameId === focusPersonId && personNameId && personNameId !== focusPersonId) return personNameId;
    if (personNameId === focusPersonId || matchNameId === focusPersonId) return ownerPersonId;
    const personNameLooksLikeFocus = scoreNameMatch(focusFullName, summary.personName) >= 60;
    const matchNameLooksLikeFocus = scoreNameMatch(focusFullName, summary.matchName) >= 60;
    if (personNameLooksLikeFocus || matchNameLooksLikeFocus) return ownerPersonId;
    if (summary.fileName) {
      const fileNames = extractComparisonNamesFromFileName(summary.fileName);
      if (fileNames) {
        const [firstName, secondName] = fileNames;
        const firstId = resolvePersonIdByName(firstName, nameRows);
        const secondId = resolvePersonIdByName(secondName, nameRows);
        if (firstId === focusPersonId && secondId && secondId !== focusPersonId) return secondId;
        if (secondId === focusPersonId && firstId && firstId !== focusPersonId) return firstId;
        if (scoreNameMatch(focusFullName, firstName) >= 60 && ownerPersonId !== focusPersonId) {
          return ownerPersonId;
        }
        if (scoreNameMatch(focusFullName, secondName) >= 60 && ownerPersonId !== focusPersonId) {
          return ownerPersonId;
        }
      }
    }
  }
  return null;
};

const readSharedMatchPersonId = (metadata: Record<string, unknown>): string | null => {
  const direct =
    typeof metadata.sharedMatchPersonId === 'string'
      ? metadata.sharedMatchPersonId
      : typeof metadata.shared_match_person_id === 'string'
      ? metadata.shared_match_person_id
      : null;
  if (!direct || !UUID_REGEX.test(direct)) return null;
  return direct;
};

const readSharedPersonId = (metadata: Record<string, unknown>): string | null => {
  const direct =
    typeof metadata.sharedPersonId === 'string'
      ? metadata.sharedPersonId
      : typeof metadata.shared_person_id === 'string'
      ? metadata.shared_person_id
      : null;
  if (!direct || !UUID_REGEX.test(direct)) return null;
  return direct;
};

const readSharedTestRowId = (row: any) =>
  typeof row?.test_id === 'string' ? row.test_id : typeof row?.id === 'string' ? row.id : null;

const readSharedTestOwnerId = (row: any) =>
  typeof row?.owner_person_id === 'string'
    ? row.owner_person_id
    : typeof row?.person_id === 'string'
    ? row.person_id
    : null;

const findRelationshipPath = findDnaBloodRelationshipPath;

export const fetchDnaPathRelationships = async (treeId: string): Promise<RelationshipLookupRow[]> => {
  const { data, error } = await supabase.rpc('load_dna_path_relationships', {
    target_tree_id: treeId,
  });
  if (error) throw new Error(error.message);
  return parseRpcJsonPage(data).filter(
    (row) =>
      !!row.id &&
      !!row.person_id &&
      !!row.related_id &&
      DNA_BLOOD_PATH_RELATIONSHIP_TYPES.has(String(row.type || ''))
  ) as RelationshipLookupRow[];
};

export interface DnaLineageResolveOptions {
  pathRelationships?: RelationshipLookupRow[];
}

const resolvePathRelationships = async (
  treeId: string,
  options?: DnaLineageResolveOptions
): Promise<RelationshipLookupRow[]> => options?.pathRelationships ?? fetchDnaPathRelationships(treeId);

export const fetchPersonNameRows = async (personIds: string[]): Promise<NameLookupRow[]> => {
  const rows = await fetchPersonSummaryRowsByIds(
    personIds,
    'id, first_name, last_name, maiden_name, metadata'
  );
  return rows.map((row: any) => mapDbRowToNameLookup(row));
};

const PERSON_SUMMARY_SELECT =
  'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, metadata, updated_at, is_living, is_private';

export const fetchPersonSummaryRowsByIds = async (personIds: string[], select = PERSON_SUMMARY_SELECT) => {
  const uniqueIds = Array.from(new Set(personIds.filter(Boolean)));
  if (!uniqueIds.length || !isSupabaseConfigured()) return [];
  const rows: any[] = [];
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const batchIds = uniqueIds.slice(i, i + 200);
    const { data, error } = await supabase.from('persons').select(select).in('id', batchIds);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
};

export const buildDnaMatchPayload = async (targetPersonId: string, dnaTests: DNATest[]): Promise<DnaMatchPayloadItem[]> => {
  const sharedTests = dnaTests.filter(
    (test) => test.type === 'Shared Autosomal' && (test.sharedSegmentSummary || test.sharedMatchName)
  );
  if (!sharedTests.length) return [];

  const { data: personRow, error: personError } = await supabase
    .from('persons')
    .select('id, tree_id')
    .eq('id', targetPersonId)
    .maybeSingle();
  if (personError) throw new Error(personError.message);
  if (!personRow?.tree_id) return [];

  const [peopleResponse, typedRows] = await Promise.all([
    supabase
      .from('persons')
      .select('id, first_name, last_name, maiden_name, metadata')
      .eq('tree_id', personRow.tree_id),
    fetchDnaPathRelationships(personRow.tree_id)
  ]);

  if (peopleResponse.error) throw new Error(peopleResponse.error.message);

  const nameRows: NameLookupRow[] = ((peopleResponse.data || []) as any[]).map((row) =>
    mapDbRowToNameLookup(row)
  );
  const relationshipRows = typedRows;

  const payloadItems: DnaMatchPayloadItem[] = [];

  sharedTests.forEach((test) => {
    const summary = test.sharedSegmentSummary;
    const importedPersonName = summary?.personName || null;
    const importedMatchName = summary?.matchName || test.sharedMatchName || null;
    const importedPersonId = resolvePersonIdByName(importedPersonName, nameRows);
    const importedMatchId = resolvePersonIdByName(importedMatchName, nameRows);

    let matchedPersonId: string | null = null;
    if (test.sharedMatchPersonId && UUID_REGEX.test(test.sharedMatchPersonId)) {
      matchedPersonId = test.sharedMatchPersonId;
    } else if (importedPersonId === targetPersonId && importedMatchId) {
      matchedPersonId = importedMatchId;
    } else if (importedMatchId === targetPersonId && importedPersonId && importedPersonId !== targetPersonId) {
      matchedPersonId = importedPersonId;
    } else if (importedMatchId) {
      matchedPersonId = importedMatchId;
    } else if (importedPersonId && importedPersonId !== targetPersonId) {
      matchedPersonId = importedPersonId;
    }

    if (!matchedPersonId || matchedPersonId === targetPersonId) return;

    const path = findRelationshipPath(targetPersonId, matchedPersonId, relationshipRows);
    const pathPersonIds = path?.pathPersonIds || [targetPersonId, matchedPersonId];
    const pathRelationshipIds = path?.pathRelationshipIds || [];

    const sharedCM = summary?.totalCentimorgans ?? 0;
    const segments = summary?.segmentCount ?? 0;
    const longestSegment = summary?.largestSegmentCentimorgans ?? null;
    payloadItems.push({
      matched_person_id: matchedPersonId,
      shared_cm: sharedCM,
      segments,
      longest_segment: longestSegment,
      confidence: deriveMatchConfidence(sharedCM, segments),
      path_person_ids: pathPersonIds,
      path_relationship_ids: pathRelationshipIds,
      metadata: {
        source: summary?.source || 'SHARED_AUTOSOMAL_SEGMENTS_CSV',
        test_id: test.id,
        match_name: summary?.matchName || test.sharedMatchName || null,
        person_name: summary?.personName || null,
        file_name: summary?.fileName || null,
        segment_count: summary?.segmentCount ?? null,
        total_centimorgans: summary?.totalCentimorgans ?? null,
        largest_segment_centimorgans: summary?.largestSegmentCentimorgans ?? null,
        path_found: !!path,
      },
    });
  });

  return payloadItems;
};



export const listAutosomalPeopleInTree = async (treeId: string): Promise<DNAAutosomalCandidate[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data, error } = await supabase.rpc('list_tree_autosomal_testers', {
    target_tree_id: treeId,
  });
  if (error) throw new Error(error.message);

  return parseRpcJsonPage(data)
    .map((row: any) => ({
      personId: row.person_id as string,
      name: toDisplayName(row),
      birthYear: extractYear(row.birth_date_text),
      deathYear: extractYear(row.death_date_text),
      autosomalTestCount: Number(row.autosomal_test_count || 0),
    }))
    .filter((item) => !!item.personId && item.autosomalTestCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const listSharedMatchesForAutosomalPerson = async (
  treeId: string,
  focusPersonId: string
): Promise<DNASharedMatchRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data: focusRow, error: focusError } = await supabase
    .from('persons')
    .select('id, tree_id, first_name, last_name')
    .eq('id', focusPersonId)
    .eq('tree_id', treeId)
    .maybeSingle();
  if (focusError) throw new Error(focusError.message);
  if (!focusRow) return [];

  const focusFullName = buildFullName(focusRow.first_name, focusRow.last_name);

  const [typedRelationships, matchResponse, sharedTestsResponse, familyKitsResponse, treePeopleResponse] =
    await Promise.all([
    fetchDnaPathRelationships(treeId),
    supabase
      .from('dna_matches')
      .select('id, person_id, matched_person_id, shared_cm, segments, longest_segment, confidence, metadata, created_at')
      .or(`person_id.eq.${focusPersonId},matched_person_id.eq.${focusPersonId}`)
      .order('shared_cm', { ascending: false }),
    supabase.rpc('list_focus_shared_autosomal_tests', {
      target_tree_id: treeId,
      focus_person_id: focusPersonId,
    }),
    supabase.rpc('list_family_autosomal_kits', {
      target_tree_id: treeId,
      focus_person_id: focusPersonId,
    }),
    supabase
      .from('persons')
      .select('id, first_name, last_name, maiden_name, metadata')
      .eq('tree_id', treeId),
  ]);
  if (matchResponse.error) throw new Error(matchResponse.error.message);
  if (sharedTestsResponse.error) throw new Error(sharedTestsResponse.error.message);
  if (familyKitsResponse.error) throw new Error(familyKitsResponse.error.message);
  if (treePeopleResponse.error) throw new Error(treePeopleResponse.error.message);
  const matchRows = matchResponse.data ?? [];
  const sharedTests: any[] = parseRpcJsonPage(sharedTestsResponse.data);
  const familyKits: any[] = parseRpcJsonPage(familyKitsResponse.data);
  const nameRows: NameLookupRow[] = ((treePeopleResponse.data || []) as any[]).map((row) =>
    mapDbRowToNameLookup(row)
  );
  const personById = new Map<string, NameLookupRow>(nameRows.map((row) => [row.id, row]));

  const results: DNASharedMatchRecord[] = [];
  const existingTestIds = new Set<string>();
  const existingPairs = new Set<string>();

  (matchRows || []).forEach((row: any) => {
    if (!row.person_id || !row.matched_person_id) return;
    const owner = personById.get(row.person_id);
    const counterpartId = row.person_id === focusPersonId ? row.matched_person_id : row.person_id;
    const counterpart = personById.get(counterpartId);
    if (!owner || !counterpart) return;
    const metadata = asRecord(row.metadata);
    const path = findRelationshipPath(focusPersonId, counterpartId, typedRelationships);
    const pathPersonIds = path?.pathPersonIds || [];
    const pathRelationshipIds = path?.pathRelationshipIds || [];
    const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
    const sharedCM = toNumberOrNull(row.shared_cm);
    const segments = toNumberOrNull(row.segments);
    const longestSegment = toNumberOrNull(row.longest_segment);
    const predictionLabel = relationshipPredictionLabel(sharedCM, segments);
    const pathFitsPrediction = computePathFitsPrediction(
      pathFound,
      pathPersonIds,
      pathRelationshipIds,
      typedRelationships,
      sharedCM
    );
    const dnaTestId = typeof metadata.test_id === 'string' ? metadata.test_id : undefined;
    if (dnaTestId) existingTestIds.add(dnaTestId);
    existingPairs.add([focusPersonId, counterpartId].sort().join(':'));
    results.push({
      id: row.id,
      source: 'dna_match',
      dnaMatchId: row.id,
      dnaTestId,
      ownerPersonId: row.person_id,
      ownerPersonName: toDisplayName(owner),
      counterpartPersonId: counterpartId,
      counterpartPersonName: toDisplayName(counterpart),
      sharedCM,
      segments,
      longestSegment,
      confidence: row.confidence ?? null,
      predictionLabel,
      pathFound,
      pathFitsPrediction,
      pathPersonIds,
      pathRelationshipIds,
      fileName: typeof metadata.file_name === 'string' ? metadata.file_name : undefined,
      importedAt: typeof metadata.imported_at === 'string' ? metadata.imported_at : undefined,
      sharedSegmentsPreview: sharedSegmentsPreviewFromMetadata(metadata),
    });
  });

  sharedTests.forEach((testRow) => {
    const testId = readSharedTestRowId(testRow);
    const ownerPersonId = readSharedTestOwnerId(testRow);
    if (!testId || !ownerPersonId) return;
    if (existingTestIds.has(testId)) return;
    const metadata = asRecord(testRow.metadata);
    const sharedPersonIdFromRow =
      typeof testRow.shared_person_id === 'string' && UUID_REGEX.test(testRow.shared_person_id)
        ? testRow.shared_person_id
        : null;
    const sharedMatchPersonIdFromRow =
      typeof testRow.shared_match_person_id === 'string' && UUID_REGEX.test(testRow.shared_match_person_id)
        ? testRow.shared_match_person_id
        : null;
    const explicitSharedPersonId = readSharedPersonId(metadata);
    const ownerPersonRow =
      personById.get(ownerPersonId) ||
      ({
        first_name: testRow.owner_first_name || '',
        last_name: testRow.owner_last_name || '',
      } as any);
    const explicitMatchPersonId = readSharedMatchPersonId(metadata);
    const staleSelfMatchLink =
      !!explicitMatchPersonId &&
      explicitMatchPersonId === ownerPersonId &&
      (!sharedPersonIdFromRow || sharedPersonIdFromRow === ownerPersonId) &&
      (!explicitSharedPersonId || explicitSharedPersonId === ownerPersonId);
    const resolvedMatchPersonId = staleSelfMatchLink ? null : explicitMatchPersonId;
    const rpcCounterpartId =
      typeof testRow.counterpart_person_id === 'string' && UUID_REGEX.test(testRow.counterpart_person_id)
        ? testRow.counterpart_person_id
        : null;
    const rpcCounterpartRow =
      rpcCounterpartId && (testRow.counterpart_first_name || testRow.counterpart_last_name)
        ? ({
            first_name: testRow.counterpart_first_name || '',
            last_name: testRow.counterpart_last_name || '',
          } as any)
        : null;
    let counterpartPersonId: string | null = null;
    const summary = summaryFromDnaTestMetadata(metadata);
    if (!summary) return;

    const sharedPersonId = sharedPersonIdFromRow || explicitSharedPersonId;
    const sharedMatchPersonId = sharedMatchPersonIdFromRow || resolvedMatchPersonId;

    if (
      !focusIsSharedMatchParty(
        focusPersonId,
        focusFullName,
        summary,
        nameRows,
        sharedPersonId,
        sharedMatchPersonId,
        ownerPersonId
      )
    ) {
      return;
    }

    const summaryCounterpartId = resolveCounterpartFromSummaryNames(focusPersonId, summary, nameRows);
    if (summaryCounterpartId) {
      counterpartPersonId = summaryCounterpartId;
    }
    if (!counterpartPersonId && sharedPersonId && sharedMatchPersonId) {
      if (sharedPersonId === focusPersonId && sharedMatchPersonId !== focusPersonId) {
        counterpartPersonId = sharedMatchPersonId;
      } else if (sharedMatchPersonId === focusPersonId && sharedPersonId !== focusPersonId) {
        counterpartPersonId = sharedPersonId;
      }
    }
    if (!counterpartPersonId && rpcCounterpartId) {
      if (ownerPersonId === focusPersonId && rpcCounterpartId !== focusPersonId) {
        counterpartPersonId = rpcCounterpartId;
      } else if (rpcCounterpartId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }
    if (!counterpartPersonId && resolvedMatchPersonId) {
      if (ownerPersonId === focusPersonId && resolvedMatchPersonId !== focusPersonId) {
        counterpartPersonId = resolvedMatchPersonId;
      } else if (resolvedMatchPersonId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }

    if (!counterpartPersonId && summary) {
      counterpartPersonId = inferCounterpartForFocus(
        focusPersonId,
        ownerPersonId,
        summary,
        nameRows,
        focusFullName
      );
    }
    if (counterpartPersonId === focusPersonId) return;
    const pairKey = counterpartPersonId
      ? [focusPersonId, counterpartPersonId].sort().join(':')
      : `test:${testId}`;
    if (counterpartPersonId && existingPairs.has(pairKey)) return;

    const path = counterpartPersonId
      ? findRelationshipPath(focusPersonId, counterpartPersonId, typedRelationships)
      : null;
    const pathPersonIds = path?.pathPersonIds || [];
    const pathRelationshipIds = path?.pathRelationshipIds || [];
    const pathFound =
      !!counterpartPersonId && pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
    const predictionLabel = relationshipPredictionLabel(summary.totalCentimorgans, summary.segmentCount);
    const pathFitsPrediction = computePathFitsPrediction(
      pathFound,
      pathPersonIds,
      pathRelationshipIds,
      typedRelationships,
      summary.totalCentimorgans
    );

    const counterpartNameFromPeople =
      counterpartPersonId && personById.has(counterpartPersonId)
        ? toDisplayName(personById.get(counterpartPersonId))
        : null;
    const counterpartNameFromRpc = rpcCounterpartRow ? toDisplayName(rpcCounterpartRow) : null;
    const counterpartPersonName =
      counterpartNameFromPeople ||
      counterpartNameFromRpc ||
      inferCounterpartDisplayName(focusPersonId, ownerPersonId, summary, focusFullName) ||
      summary.matchName ||
      'Unknown';
    const nameSuggestion = !counterpartPersonId
      ? findBestNameMatch(counterpartPersonName, nameRows, focusPersonId)
      : null;

    results.push({
      id: `test:${testId}`,
      source: 'dna_test',
      dnaTestId: testId,
      ownerPersonId,
      ownerPersonName: toDisplayName(ownerPersonRow),
      counterpartPersonId,
      counterpartPersonName,
      isCounterpartLinked: !!counterpartPersonId,
      suggestedNameMatchPersonId: nameSuggestion?.id,
      suggestedNameMatchPersonName: nameSuggestion?.displayName,
      suggestedNameMatchScore: nameSuggestion?.score,
      sharedCM: summary.totalCentimorgans,
      segments: summary.segmentCount,
      longestSegment: summary.largestSegmentCentimorgans,
      confidence: deriveMatchConfidence(summary.totalCentimorgans, summary.segmentCount),
      predictionLabel,
      pathFound,
      pathFitsPrediction,
      pathPersonIds,
      pathRelationshipIds,
      fileName: summary.fileName,
      importedAt: summary.importedAt,
      sharedSegmentsPreview: sharedSegmentsPreviewFromMetadata(metadata),
    });
  });

  familyKits.forEach((kitRow) => {
    const testId = typeof kitRow.test_id === 'string' ? kitRow.test_id : null;
    const ownerPersonId = typeof kitRow.owner_person_id === 'string' ? kitRow.owner_person_id : null;
    if (!testId || !ownerPersonId || ownerPersonId === focusPersonId) return;
    if (existingTestIds.has(testId)) return;
    const pairKey = [focusPersonId, ownerPersonId].sort().join(':');
    if (existingPairs.has(pairKey)) return;

    const metadata = asRecord(kitRow.metadata);
    const relationLabel =
      typeof kitRow.relation_label === 'string' && kitRow.relation_label.trim()
        ? kitRow.relation_label.trim()
        : 'Family member';
    const ownerPersonRow =
      personById.get(ownerPersonId) ||
      ({
        first_name: kitRow.owner_first_name || '',
        last_name: kitRow.owner_last_name || '',
      } as any);
    const path = findRelationshipPath(focusPersonId, ownerPersonId, typedRelationships);
    const pathPersonIds = path?.pathPersonIds || [];
    const pathRelationshipIds = path?.pathRelationshipIds || [];
    const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
    const pathFitsPrediction = computePathFitsPrediction(
      pathFound,
      pathPersonIds,
      pathRelationshipIds,
      typedRelationships,
      null
    );

    existingPairs.add(pairKey);
    existingTestIds.add(testId);
    results.push({
      id: `family-kit:${testId}`,
      source: 'family_kit',
      familyRelationLabel: relationLabel,
      dnaTestId: testId,
      ownerPersonId,
      ownerPersonName: toDisplayName(ownerPersonRow),
      counterpartPersonId: ownerPersonId,
      counterpartPersonName: toDisplayName(ownerPersonRow),
      sharedCM: null,
      segments: null,
      longestSegment: null,
      confidence: null,
      predictionLabel: familyKitPredictionLabel(relationLabel),
      pathFound,
      pathFitsPrediction,
      pathPersonIds,
      pathRelationshipIds,
      fileName: rawAutosomalFileNameFromMetadata(metadata),
      importedAt: rawAutosomalImportedAtFromMetadata(metadata),
    });
  });

  return results.sort((a, b) => {
    const score = (row: DNASharedMatchRecord) => {
      if (row.source === 'family_kit') return 10_000;
      return row.sharedCM ?? 0;
    };
    return score(b) - score(a);
  });
};

const resolveUnknownMatchName = (
  focusPersonId: string,
  summary: SharedSegmentSummaryLike,
  nameRows: NameLookupRow[]
) => {
  const personNameId = resolvePersonIdByName(summary.personName, nameRows);
  const matchNameId = resolvePersonIdByName(summary.matchName, nameRows);
  if (personNameId === focusPersonId && summary.matchName) return summary.matchName;
  if (matchNameId === focusPersonId && summary.personName) return summary.personName;
  return summary.matchName || summary.personName || 'Unknown DNA Match';
};

export const listUnlinkedSharedMatchesForAutosomalPerson = async (
  treeId: string,
  focusPersonId: string
): Promise<UnlinkedDnaMatchRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data: focusRow, error: focusError } = await supabase
    .from('persons')
    .select('id, tree_id, first_name, last_name')
    .eq('id', focusPersonId)
    .eq('tree_id', treeId)
    .maybeSingle();
  if (focusError) throw new Error(focusError.message);
  if (!focusRow) return [];

  const focusFullName = buildFullName(focusRow.first_name, focusRow.last_name);
  const [nameRowsResponse, sharedTestsResponse] = await Promise.all([
    supabase.from('persons').select('id, first_name, last_name, maiden_name, metadata').eq('tree_id', treeId),
    supabase.rpc('list_focus_shared_autosomal_tests', {
      target_tree_id: treeId,
      focus_person_id: focusPersonId,
    }),
  ]);
  if (nameRowsResponse.error) throw new Error(nameRowsResponse.error.message);
  if (sharedTestsResponse.error) throw new Error(sharedTestsResponse.error.message);

  const nameRows = ((nameRowsResponse.data || []) as any[]).map((row) => mapDbRowToNameLookup(row));
  const sharedTests: any[] = parseRpcJsonPage(sharedTestsResponse.data);
  const unlinked: UnlinkedDnaMatchRecord[] = [];
  const seenTestIds = new Set<string>();

  const { data: linkedMatchRows, error: linkedMatchError } = await supabase
    .from('dna_matches')
    .select('person_id, matched_person_id, metadata')
    .or(`person_id.eq.${focusPersonId},matched_person_id.eq.${focusPersonId}`);
  if (linkedMatchError) throw new Error(linkedMatchError.message);

  const linkedCounterpartIds = new Set<string>();
  const linkedDnaTestIds = new Set<string>();
  (linkedMatchRows || []).forEach((row: { person_id?: string; matched_person_id?: string; metadata?: unknown }) => {
    const counterpartId =
      row.person_id === focusPersonId ? row.matched_person_id : row.person_id;
    if (counterpartId) linkedCounterpartIds.add(counterpartId);
    const metadata = asRecord(row.metadata);
    if (typeof metadata.test_id === 'string') linkedDnaTestIds.add(metadata.test_id);
  });

  sharedTests.forEach((testRow) => {
    const testId = readSharedTestRowId(testRow);
    const ownerPersonId = readSharedTestOwnerId(testRow);
    if (!testId || !ownerPersonId || seenTestIds.has(testId)) return;
    const metadata = asRecord(testRow.metadata);
    const summary = summaryFromDnaTestMetadata(metadata);
    if (!summary) return;

    const sharedPersonIdFromRow =
      typeof testRow.shared_person_id === 'string' && UUID_REGEX.test(testRow.shared_person_id)
        ? testRow.shared_person_id
        : null;
    const sharedMatchPersonIdFromRow =
      typeof testRow.shared_match_person_id === 'string' && UUID_REGEX.test(testRow.shared_match_person_id)
        ? testRow.shared_match_person_id
        : null;
    const explicitSharedPersonId = readSharedPersonId(metadata);
    const explicitMatchPersonId = readSharedMatchPersonId(metadata);
    const sharedPersonId = sharedPersonIdFromRow || explicitSharedPersonId;
    const sharedMatchPersonId = sharedMatchPersonIdFromRow || explicitMatchPersonId;

    if (
      !focusIsSharedMatchParty(
        focusPersonId,
        focusFullName,
        summary,
        nameRows,
        sharedPersonId,
        sharedMatchPersonId,
        ownerPersonId
      )
    ) {
      return;
    }

    let counterpartPersonId: string | null = null;
    const summaryCounterpartId = resolveCounterpartFromSummaryNames(focusPersonId, summary, nameRows);
    if (summaryCounterpartId) counterpartPersonId = summaryCounterpartId;
    if (!counterpartPersonId && sharedPersonId && sharedMatchPersonId) {
      if (sharedPersonId === focusPersonId && sharedMatchPersonId !== focusPersonId) {
        counterpartPersonId = sharedMatchPersonId;
      } else if (sharedMatchPersonId === focusPersonId && sharedPersonId !== focusPersonId) {
        counterpartPersonId = sharedPersonId;
      }
    }
    if (!counterpartPersonId && typeof testRow.counterpart_person_id === 'string') {
      const rpcCounterpartId = testRow.counterpart_person_id;
      if (ownerPersonId === focusPersonId && rpcCounterpartId !== focusPersonId) {
        counterpartPersonId = rpcCounterpartId;
      } else if (rpcCounterpartId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }
    if (!counterpartPersonId && explicitMatchPersonId) {
      if (ownerPersonId === focusPersonId && explicitMatchPersonId !== focusPersonId) {
        counterpartPersonId = explicitMatchPersonId;
      } else if (explicitMatchPersonId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }
    if (!counterpartPersonId) {
      counterpartPersonId = inferCounterpartForFocus(
        focusPersonId,
        ownerPersonId,
        summary,
        nameRows,
        focusFullName
      );
    }

    if (linkedDnaTestIds.has(testId)) return;
    if (ownerPersonId === focusPersonId) return;
    if (counterpartPersonId && linkedCounterpartIds.has(counterpartPersonId)) return;
    if (isK3DismissedForFocus(metadata, focusPersonId)) return;

    const matchName = resolveUnknownMatchName(focusPersonId, summary, nameRows);
    const nameSuggestion = findBestNameMatch(matchName, nameRows, focusPersonId);
    if (nameSuggestion?.id && linkedCounterpartIds.has(nameSuggestion.id)) return;
    const nameResolvedId = resolvePersonIdByName(matchName, nameRows, focusPersonId);
    if (nameResolvedId && linkedCounterpartIds.has(nameResolvedId)) return;

    seenTestIds.add(testId);
    unlinked.push({
      id: `unlinked:${testId}`,
      dnaTestId: testId,
      ownerPersonId,
      ownerPersonName: buildFullName(testRow.owner_first_name, testRow.owner_last_name) || 'Unknown',
      matchName,
      sharedCM: summary.totalCentimorgans,
      segments: summary.segmentCount,
      longestSegment: summary.largestSegmentCentimorgans,
      predictionLabel: relationshipPredictionLabel(summary.totalCentimorgans, summary.segmentCount),
      confidence: deriveMatchConfidence(summary.totalCentimorgans, summary.segmentCount),
      fileName: summary.fileName,
      importedAt: summary.importedAt,
      sharedSegmentsPreview: sharedSegmentsPreviewFromMetadata(metadata),
      suggestedNameMatchPersonId: nameSuggestion?.id,
      suggestedNameMatchPersonName: nameSuggestion?.displayName,
      suggestedNameMatchScore: nameSuggestion?.score,
    });
  });

  return unlinked.sort((a, b) => (b.sharedCM ?? 0) - (a.sharedCM ?? 0));
};

const upsertDnaMatchLink = async ({
  treeId,
  focusPersonId,
  counterpartPersonId,
  dnaTestId,
  matchName,
  sharedCM,
  segments,
  longestSegment,
}: {
  treeId: string;
  focusPersonId: string;
  counterpartPersonId: string;
  dnaTestId: string;
  matchName: string;
  sharedCM: number | null;
  segments: number | null;
  longestSegment: number | null;
}) => {
  const typedRows = await fetchDnaPathRelationships(treeId);
  const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRows);
  const pathPersonIds = path?.pathPersonIds || [focusPersonId, counterpartPersonId];
  const pathRelationshipIds = path?.pathRelationshipIds || [];
  const confidence = deriveMatchConfidence(sharedCM ?? 0, segments ?? 0);

  const { data: existingRows, error: existingError } = await supabase
    .from('dna_matches')
    .select('id')
    .eq('person_id', focusPersonId)
    .eq('matched_person_id', counterpartPersonId)
    .limit(1);
  if (existingError) throw new Error(existingError.message);

  if (existingRows?.length) {
    const { error: updateError } = await supabase
      .from('dna_matches')
      .update({
        shared_cm: sharedCM,
        segments,
        longest_segment: longestSegment,
        confidence,
        metadata: {
          test_id: dnaTestId,
          match_name: matchName,
          path_person_ids: pathPersonIds,
          path_relationship_ids: pathRelationshipIds,
          placed_via: 'k3_unknown_match',
        },
      })
      .eq('id', existingRows[0].id);
    if (updateError) throw new Error(updateError.message);
    return existingRows[0].id as string;
  }

  const matchId = randomId();
  const { error: insertError } = await supabase.from('dna_matches').insert({
    id: matchId,
    person_id: focusPersonId,
    matched_person_id: counterpartPersonId,
    shared_cm: sharedCM,
    segments,
    longest_segment: longestSegment,
    confidence,
    metadata: {
      test_id: dnaTestId,
      match_name: matchName,
      path_person_ids: pathPersonIds,
      path_relationship_ids: pathRelationshipIds,
      placed_via: 'k3_unknown_match',
    },
  });
  if (insertError) throw new Error(insertError.message);
  return matchId;
};

const linkDnaTestCounterpart = async (dnaTestId: string, counterpartPersonId: string, matchName: string) => {
  const { data: testRow, error: fetchError } = await supabase
    .from('dna_tests')
    .select('metadata')
    .eq('id', dnaTestId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!testRow) throw new Error('DNA test not found.');

  const metadata = asRecord(testRow.metadata);
  const updatedMetadata = {
    ...metadata,
    sharedMatchPersonId: counterpartPersonId,
    sharedMatchName: matchName,
  };
  const { error: updateError } = await supabase
    .from('dna_tests')
    .update({
      shared_match_person_id: counterpartPersonId,
      metadata: updatedMetadata,
    })
    .eq('id', dnaTestId);
  if (updateError) throw new Error(updateError.message);
};

export const linkUnlinkedDnaTestToPerson = async ({
  treeId,
  focusPersonId,
  dnaTestId,
  targetPersonId,
  matchName,
  sharedCM,
  segments,
  longestSegment,
}: {
  treeId: string;
  focusPersonId: string;
  dnaTestId: string;
  targetPersonId: string;
  matchName: string;
  sharedCM: number | null;
  segments: number | null;
  longestSegment: number | null;
}): Promise<{ personId: string }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  await linkDnaTestCounterpart(dnaTestId, targetPersonId, matchName);
  await upsertDnaMatchLink({
    treeId,
    focusPersonId,
    counterpartPersonId: targetPersonId,
    dnaTestId,
    matchName,
    sharedCM,
    segments,
    longestSegment,
  });
  return { personId: targetPersonId };
};

export const dismissUnlinkedDnaMatchForFocus = async ({
  dnaTestId,
  focusPersonId,
}: {
  dnaTestId: string;
  focusPersonId: string;
}): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data: testRow, error: fetchError } = await supabase
    .from('dna_tests')
    .select('metadata')
    .eq('id', dnaTestId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!testRow) throw new Error('DNA test not found.');

  const metadata = asRecord(testRow.metadata);
  if (isK3DismissedForFocus(metadata, focusPersonId)) return;

  const { error: updateError } = await supabase
    .from('dna_tests')
    .update({
      metadata: withK3DismissedForFocus(metadata, focusPersonId),
    })
    .eq('id', dnaTestId);
  if (updateError) throw new Error(updateError.message);
};

export const createDnaMatchPlaceholderPerson = async ({
  treeId,
  focusPersonId,
  dnaTestId,
  matchName,
  sharedCM,
  segments,
  longestSegment,
  actor,
}: {
  treeId: string;
  focusPersonId: string;
  dnaTestId: string;
  matchName: string;
  sharedCM: number | null;
  segments: number | null;
  longestSegment: number | null;
  actor?: ImportActor | null;
}): Promise<{ personId: string; person: Person }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const parsed = parseMatchDisplayName(matchName);
  const confidence = deriveMatchConfidence(sharedCM ?? 0, segments ?? 0);
  const personId = randomId();
  const { data: personRow, error: personError } = await supabase
    .from('persons')
    .insert({
      id: personId,
      tree_id: treeId,
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      maiden_name: null,
      gender: 'O',
      birth_date_text: null,
      death_date_text: null,
      birth_place_text: null,
      death_place_text: null,
      burial_date_text: null,
      burial_place_text: null,
      residence_at_death_text: null,
      metadata: {
        createdVia: 'dna_unknown_match_placement',
        sourceDnaTestId: dnaTestId,
      },
      bio: null,
      occupations: [],
      created_by: normalizedActor.id,
      is_private: false,
      is_dna_match: true,
      dna_match_info: {
        sharedCM: sharedCM ?? 0,
        segments: segments ?? 0,
        longestSegment: longestSegment ?? undefined,
        confidence,
      },
      is_living: null,
      tags: [],
      user_role: null,
    })
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, burial_date_text, burial_place_text, residence_at_death_text, metadata, bio, occupations, updated_at, created_by, is_dna_match, dna_match_info, is_living, is_private'
    )
    .single();
  if (personError) throw new Error(personError.message);

  await linkDnaTestCounterpart(dnaTestId, personId, matchName);
  await upsertDnaMatchLink({
    treeId,
    focusPersonId,
    counterpartPersonId: personId,
    dnaTestId,
    matchName,
    sharedCM,
    segments,
    longestSegment,
  });

  return {
    personId,
    person: mapDbPerson(personRow, {}, {}, {}, {}),
  };
};

export const purgeDnaRawData = async (
  dnaTestId: string,
  actor?: ImportActor | null
): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_purge_dna_raw_data', {
    target_test_id: dnaTestId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name,
  });
  if (error) throw new Error(error.message);
};

export interface AutosomalRawKitRecord {
  testId: string;
  personId: string;
  personName: string;
  encryptedRawPayload?: string;
  rawMarkerIndexStats?: AutosomalIndexStats;
}

export const listAutosomalRawKitsForTree = async (treeId: string): Promise<AutosomalRawKitRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data: personRows, error: personError } = await supabase
    .from('persons')
    .select('id, first_name, last_name')
    .eq('tree_id', treeId);
  if (personError) throw new Error(personError.message);
  const personIds = (personRows || []).map((row: any) => row.id as string).filter(Boolean);
  if (!personIds.length) return [];

  const personNameById = new Map(
    (personRows || []).map((row: any) => [
      row.id as string,
      buildFullName(row.first_name, row.last_name),
    ])
  );

  const kits: AutosomalRawKitRecord[] = [];
  for (let i = 0; i < personIds.length; i += 200) {
    const batch = personIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('dna_tests')
      .select('id, person_id, metadata')
      .in('person_id', batch)
      .eq('test_type', 'Autosomal');
    if (error) throw new Error(error.message);
    (data || []).forEach((row: any) => {
      const metadata = asRecord(row.metadata);
      const stats = metadata.rawMarkerIndexStats as AutosomalIndexStats | undefined;
      const encrypted =
        typeof metadata.encryptedRawPayload === 'string' ? metadata.encryptedRawPayload : undefined;
      if (!stats && !encrypted) return;
      kits.push({
        testId: row.id as string,
        personId: row.person_id as string,
        personName: personNameById.get(row.person_id) || 'Unknown',
        encryptedRawPayload: encrypted,
        rawMarkerIndexStats: stats,
      });
    });
  }

  return kits.sort((a, b) => a.personName.localeCompare(b.personName));
};

/** `shared_cm` keyed by `dna_matches.id`, for the given match ids. Used to surface cM on DNA-backed
 *  pedigree edges (roadmap L1). `dna_matches` has no `tree_id` (its RLS policy scopes through
 *  `persons`), so callers pass the match ids referenced by `relationships.metadata.dna_support_by_person`
 *  (collected via lib/dnaSupport.ts). Empty ids or unset Supabase → empty map. */
export const fetchDnaMatchCm = async (matchIds: string[]): Promise<Map<string, number>> => {
  const map = new Map<string, number>();
  const ids = Array.from(new Set((matchIds || []).filter(Boolean)));
  if (!ids.length || !isSupabaseConfigured()) return map;
  const { data, error } = await supabase.from('dna_matches').select('id, shared_cm').in('id', ids);
  if (error) {
    console.error('Failed to load DNA match cM', error.message);
    return map;
  }
  for (const row of data || []) {
    const cm = toNumberOrNull(row.shared_cm);
    if (row.id && cm != null) map.set(row.id as string, cm);
  }
  return map;
};

const updateRelationshipDnaSupport = async (
  relationshipIds: string[],
  focusPersonId: string,
  matchId: string,
  mode: 'add' | 'remove'
) => {
  if (!relationshipIds.length) return;
  const uniqueIds = Array.from(new Set(relationshipIds.filter(Boolean)));
  const { data, error } = await supabase
    .from('relationships')
    .select('id, metadata')
    .in('id', uniqueIds);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    const metadata = asRecord(row.metadata);
    const supportByPerson = asRecord(metadata.dna_support_by_person);
    const current = ensureStringArray(supportByPerson[focusPersonId]);
    const next =
      mode === 'add'
        ? Array.from(new Set([...current, matchId]))
        : current.filter((value) => value !== matchId);

    const nextSupportByPerson: Record<string, unknown> = { ...supportByPerson };
    if (next.length) {
      nextSupportByPerson[focusPersonId] = next;
    } else {
      delete nextSupportByPerson[focusPersonId];
    }

    const nextMetadata: Record<string, unknown> = { ...metadata };
    if (Object.keys(nextSupportByPerson).length) {
      nextMetadata.dna_support_by_person = nextSupportByPerson;
    } else {
      delete nextMetadata.dna_support_by_person;
    }

    const { error: updateError } = await supabase
      .from('relationships')
      .update({ metadata: nextMetadata })
      .eq('id', row.id);
    if (updateError) throw new Error(updateError.message);
  }
};

export const loadDnaPathRelationshipsForTree = fetchDnaPathRelationships;

export const resolveSharedMatchLineage = async (
  treeId: string,
  focusPersonId: string,
  dnaMatchId: string,
  actor?: ImportActor | null,
  options?: DnaLineageResolveOptions
): Promise<DnaLineageResolution> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data: matchRow, error: matchError } = await supabase
    .from('dna_matches')
    .select('id, person_id, matched_person_id, shared_cm, segments, metadata')
    .eq('id', dnaMatchId)
    .maybeSingle();
  if (matchError) throw new Error(matchError.message);
  if (!matchRow) throw new Error('DNA match not found.');
  if (matchRow.person_id !== focusPersonId && matchRow.matched_person_id !== focusPersonId) {
    throw new Error('Selected DNA match does not belong to this person.');
  }

  const counterpartPersonId =
    matchRow.person_id === focusPersonId ? matchRow.matched_person_id : matchRow.person_id;
  if (!counterpartPersonId) {
    throw new Error('DNA match is missing the counterpart person.');
  }

  const matchMetadata = asRecord(matchRow.metadata);
  const previousPathRelationshipIds = ensureStringArray(matchMetadata.path_relationship_ids);

  const typedRows = await resolvePathRelationships(treeId, options);
  const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRows);
  const pathPersonIds = path?.pathPersonIds || [];
  const pathRelationshipIds = path?.pathRelationshipIds || [];
  const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
  const sharedCM = toNumberOrNull(matchRow.shared_cm);
  const segments = toNumberOrNull(matchRow.segments);
  const predictionLabel = relationshipPredictionLabel(
    sharedCM,
    segments
  );
  const pathFitsPrediction = computePathFitsPrediction(
    pathFound,
    pathPersonIds,
    pathRelationshipIds,
    typedRows,
    sharedCM
  );
  await updateRelationshipDnaSupport(previousPathRelationshipIds, focusPersonId, dnaMatchId, 'remove');
  if (pathFound && pathFitsPrediction) {
    await updateRelationshipDnaSupport(pathRelationshipIds, focusPersonId, dnaMatchId, 'add');
  }

  const normalizedActor = normalizeActor(actor);
  const updatedMetadata = {
    ...matchMetadata,
    path_found: pathFound,
    path_fits_prediction: pathFitsPrediction,
    path_person_ids: pathPersonIds,
    path_relationship_ids: pathRelationshipIds,
    resolved_at: new Date().toISOString(),
    resolved_by: normalizedActor.name
  };
  const { error: matchUpdateError } = await supabase
    .from('dna_matches')
    .update({ metadata: updatedMetadata })
    .eq('id', dnaMatchId);
  if (matchUpdateError) throw new Error(matchUpdateError.message);

  const testId = typeof matchMetadata.test_id === 'string' ? matchMetadata.test_id : null;
  if (testId && UUID_REGEX.test(testId)) {
    const { data: dnaTestRow, error: testFetchError } = await supabase
      .from('dna_tests')
      .select('id, metadata')
      .eq('id', testId)
      .maybeSingle();
    if (testFetchError) throw new Error(testFetchError.message);
    if (dnaTestRow) {
      const dnaTestMetadata = asRecord(dnaTestRow.metadata);
      const { error: testUpdateError } = await supabase
        .from('dna_tests')
        .update({
          shared_person_id: focusPersonId,
          shared_match_person_id: counterpartPersonId,
          metadata: {
            ...dnaTestMetadata,
            sharedPersonId: focusPersonId,
            sharedMatchPersonId: counterpartPersonId,
            sharedPathPersonIds: pathPersonIds,
            sharedPathRelationshipIds: pathRelationshipIds
          }
        })
        .eq('id', testId);
      if (testUpdateError) throw new Error(testUpdateError.message);
    }
  }

  const pathNames = new Map<string, string>();
  if (pathPersonIds.length) {
    const { data: personRows, error: personError } = await supabase
      .from('persons')
      .select('id, first_name, last_name')
      .in('id', pathPersonIds);
    if (personError) throw new Error(personError.message);
    (personRows || []).forEach((row: any) => pathNames.set(row.id, toDisplayName(row)));
  }

  const pathLabel = buildDnaLineagePathLabel(pathPersonIds, pathRelationshipIds, typedRows, pathNames);

  return {
    matchId: dnaMatchId,
    counterpartPersonId,
    pathFound,
    pathFitsPrediction,
    pathPersonIds,
    pathRelationshipIds,
    pathLabel,
    predictionLabel
  };
};

export const resolveSharedTestLineage = async (
  treeId: string,
  focusPersonId: string,
  dnaTestId: string,
  counterpartPersonId: string,
  actor?: ImportActor | null,
  options?: DnaLineageResolveOptions
): Promise<DnaLineageResolution> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data: dnaTestRow, error: testError } = await supabase
    .from('dna_tests')
    .select('id, person_id, metadata')
    .eq('id', dnaTestId)
    .maybeSingle();
  if (testError) throw new Error(testError.message);
  if (!dnaTestRow) throw new Error('DNA test not found.');

  const testMetadata = asRecord(dnaTestRow.metadata);
  const summary = summaryFromDnaTestMetadata(testMetadata);
  if (!summary) throw new Error('Shared autosomal summary is missing on this DNA test.');

  const typedRows = await resolvePathRelationships(treeId, options);
  const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRows);
  const pathPersonIds = path?.pathPersonIds || [];
  const pathRelationshipIds = path?.pathRelationshipIds || [];
  const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
  const predictionLabel = relationshipPredictionLabel(summary.totalCentimorgans, summary.segmentCount);
  const pathFitsPrediction = computePathFitsPrediction(
    pathFound,
    pathPersonIds,
    pathRelationshipIds,
    typedRows,
    summary.totalCentimorgans
  );

  const { data: existingMatch, error: existingMatchError } = await supabase
    .from('dna_matches')
    .select('id, metadata')
    .eq('person_id', focusPersonId)
    .eq('matched_person_id', counterpartPersonId)
    .contains('metadata', { test_id: dnaTestId })
    .maybeSingle();
  if (existingMatchError) throw new Error(existingMatchError.message);

  const normalizedActor = normalizeActor(actor);
  const matchMetadataBase = {
    ...testMetadata,
    source: summary.source || 'SHARED_AUTOSOMAL_SEGMENTS_CSV',
    test_id: dnaTestId,
    person_name: summary.personName,
    match_name: summary.matchName,
    file_name: summary.fileName ?? null,
    segment_count: summary.segmentCount,
    total_centimorgans: summary.totalCentimorgans,
    largest_segment_centimorgans: summary.largestSegmentCentimorgans,
    path_found: pathFound,
    path_fits_prediction: pathFitsPrediction,
    path_person_ids: pathPersonIds,
    path_relationship_ids: pathRelationshipIds,
    resolved_at: new Date().toISOString(),
    resolved_by: normalizedActor.name
  };

  let matchId = existingMatch?.id as string | undefined;
  if (matchId && existingMatch) {
    const previousPathRelationshipIds = ensureStringArray(asRecord(existingMatch.metadata).path_relationship_ids);
    await updateRelationshipDnaSupport(previousPathRelationshipIds, focusPersonId, matchId, 'remove');
    const { error: updateMatchError } = await supabase
      .from('dna_matches')
      .update({
        shared_cm: summary.totalCentimorgans,
        segments: summary.segmentCount,
        longest_segment: summary.largestSegmentCentimorgans,
        confidence: deriveMatchConfidence(summary.totalCentimorgans, summary.segmentCount),
        metadata: matchMetadataBase
      })
      .eq('id', matchId);
    if (updateMatchError) throw new Error(updateMatchError.message);
  } else {
    const { data: insertMatch, error: insertMatchError } = await supabase
      .from('dna_matches')
      .insert({
        person_id: focusPersonId,
        matched_person_id: counterpartPersonId,
        shared_cm: summary.totalCentimorgans,
        segments: summary.segmentCount,
        longest_segment: summary.largestSegmentCentimorgans,
        confidence: deriveMatchConfidence(summary.totalCentimorgans, summary.segmentCount),
        metadata: matchMetadataBase
      })
      .select('id')
      .single();
    if (insertMatchError) throw new Error(insertMatchError.message);
    matchId = insertMatch.id;
  }

  if (!matchId) throw new Error('Could not persist DNA match record.');
  if (pathFound && pathFitsPrediction) {
    await updateRelationshipDnaSupport(pathRelationshipIds, focusPersonId, matchId, 'add');
  }

  const { error: testUpdateError } = await supabase
    .from('dna_tests')
    .update({
      shared_person_id: focusPersonId,
      shared_match_person_id: counterpartPersonId,
      metadata: {
        ...testMetadata,
        sharedPersonId: focusPersonId,
        sharedMatchPersonId: counterpartPersonId,
        sharedPathPersonIds: pathPersonIds,
        sharedPathRelationshipIds: pathRelationshipIds
      }
    })
    .eq('id', dnaTestId);
  if (testUpdateError) throw new Error(testUpdateError.message);

  const pathNames = new Map<string, string>();
  if (pathPersonIds.length) {
    const { data: personRows, error: personError } = await supabase
      .from('persons')
      .select('id, first_name, last_name')
      .in('id', pathPersonIds);
    if (personError) throw new Error(personError.message);
    (personRows || []).forEach((row: any) => pathNames.set(row.id, toDisplayName(row)));
  }
  const pathLabel = buildDnaLineagePathLabel(pathPersonIds, pathRelationshipIds, typedRows, pathNames);

  return {
    matchId,
    counterpartPersonId,
    pathFound,
    pathFitsPrediction,
    pathPersonIds,
    pathRelationshipIds,
    pathLabel,
    predictionLabel
  };
};

export const resolveFamilyKitLineage = async (
  treeId: string,
  focusPersonId: string,
  dnaTestId: string,
  counterpartPersonId: string,
  relationLabel: string,
  actor?: ImportActor | null,
  options?: DnaLineageResolveOptions
): Promise<DnaLineageResolution> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const { data: dnaTestRow, error: testError } = await supabase
    .from('dna_tests')
    .select('id, person_id, test_type, metadata')
    .eq('id', dnaTestId)
    .maybeSingle();
  if (testError) throw new Error(testError.message);
  if (!dnaTestRow) throw new Error('DNA test not found.');
  if (dnaTestRow.person_id !== counterpartPersonId) {
    throw new Error('Family kit DNA test does not belong to the selected relative.');
  }
  if (dnaTestRow.test_type !== 'Autosomal') {
    throw new Error('Family kit lineage requires a raw Autosomal test on the relative.');
  }

  const testMetadata = asRecord(dnaTestRow.metadata);
  const typedRows = await resolvePathRelationships(treeId, options);
  const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRows);
  const pathPersonIds = path?.pathPersonIds || [];
  const pathRelationshipIds = path?.pathRelationshipIds || [];
  const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
  const predictionLabel = familyKitPredictionLabel(relationLabel);
  const pathFitsPrediction = computePathFitsPrediction(
    pathFound,
    pathPersonIds,
    pathRelationshipIds,
    typedRows,
    null
  );

  const { data: existingMatch, error: existingMatchError } = await supabase
    .from('dna_matches')
    .select('id, metadata')
    .eq('person_id', focusPersonId)
    .eq('matched_person_id', counterpartPersonId)
    .contains('metadata', { test_id: dnaTestId, family_kit: true })
    .maybeSingle();
  if (existingMatchError) throw new Error(existingMatchError.message);

  const normalizedActor = normalizeActor(actor);
  const matchMetadataBase = {
    source: 'FAMILY_AUTOSOMAL_KIT',
    family_kit: true,
    test_id: dnaTestId,
    relation_label: relationLabel,
    file_name: rawAutosomalFileNameFromMetadata(testMetadata) ?? null,
    path_found: pathFound,
    path_fits_prediction: pathFitsPrediction,
    path_person_ids: pathPersonIds,
    path_relationship_ids: pathRelationshipIds,
    resolved_at: new Date().toISOString(),
    resolved_by: normalizedActor.name,
  };

  let matchId = existingMatch?.id as string | undefined;
  if (matchId && existingMatch) {
    const previousPathRelationshipIds = ensureStringArray(asRecord(existingMatch.metadata).path_relationship_ids);
    await updateRelationshipDnaSupport(previousPathRelationshipIds, focusPersonId, matchId, 'remove');
    const { error: updateMatchError } = await supabase
      .from('dna_matches')
      .update({ metadata: matchMetadataBase })
      .eq('id', matchId);
    if (updateMatchError) throw new Error(updateMatchError.message);
  } else {
    const { data: insertMatch, error: insertMatchError } = await supabase
      .from('dna_matches')
      .insert({
        person_id: focusPersonId,
        matched_person_id: counterpartPersonId,
        shared_cm: null,
        segments: null,
        longest_segment: null,
        confidence: null,
        metadata: matchMetadataBase,
      })
      .select('id')
      .single();
    if (insertMatchError) throw new Error(insertMatchError.message);
    matchId = insertMatch.id;
  }

  if (!matchId) throw new Error('Could not persist DNA match record.');
  if (pathFound && pathFitsPrediction) {
    await updateRelationshipDnaSupport(pathRelationshipIds, focusPersonId, matchId, 'add');
  }

  const pathNames = new Map<string, string>();
  if (pathPersonIds.length) {
    const { data: personRows, error: personError } = await supabase
      .from('persons')
      .select('id, first_name, last_name')
      .in('id', pathPersonIds);
    if (personError) throw new Error(personError.message);
    (personRows || []).forEach((row: any) => pathNames.set(row.id, toDisplayName(row)));
  }
  const pathLabel = buildDnaLineagePathLabel(pathPersonIds, pathRelationshipIds, typedRows, pathNames);

  return {
    matchId,
    counterpartPersonId,
    pathFound,
    pathFitsPrediction,
    pathPersonIds,
    pathRelationshipIds,
    pathLabel,
    predictionLabel,
  };
};

/** Re-link an imported shared-segment test to the confirmed kit owner (K11 backfill). */
export const relinkSharedAutosomalTestOwner = async (
  dnaTestId: string,
  ownerPersonId: string
): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  if (!UUID_REGEX.test(dnaTestId) || !UUID_REGEX.test(ownerPersonId)) {
    throw new Error('Invalid DNA test or owner id.');
  }
  const { data: testRow, error: readError } = await supabase
    .from('dna_tests')
    .select('id, test_type, metadata, shared_person_id')
    .eq('id', dnaTestId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!testRow || testRow.test_type !== 'Shared Autosomal') {
    throw new Error('Shared autosomal test not found.');
  }
  const metadata = asRecord(testRow.metadata);
  const { error: updateError } = await supabase
    .from('dna_tests')
    .update({
      person_id: ownerPersonId,
      shared_person_id: ownerPersonId,
      metadata: {
        ...metadata,
        sharedPersonId: ownerPersonId,
        shared_person_id: ownerPersonId,
      },
    })
    .eq('id', dnaTestId);
  if (updateError) throw new Error(updateError.message);
};
