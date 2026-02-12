import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { FamilyTree as FamilyTreeType, FamilyTreeSummary, Person, Relationship, RelationshipType, Source, Note, PersonEvent, Citation, FamilyLayoutState, FamilyLayoutAudit, StructuredPlace, RelationshipConfidence, DNATest, DNATestType, DNAVendor, DNAAutosomalCandidate, DNASharedMatchRecord, DnaLineageResolution } from '../types';

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeActor = (actor?: ImportActor | null) => {
  if (!actor) {
    return { id: null, name: 'System' };
  }
  const safeId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  return {
    id: safeId,
    name: actor.name ?? 'System'
  };
};

const normalizePlace = (place?: string | { fullText?: string }) => {
  if (!place) return null;
  if (typeof place === 'string') return place;
  return place.fullText ?? null;
};

const PAGE_SIZE = 1000;

const fetchPagedRows = async <T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = PAGE_SIZE): Promise<T[]> => {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const chunk = await fetchPage(from, to);
    if (!chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
};

const chunkedInsert = async <T>(table: string, rows: T[], chunkSize = 500) => {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(slice as any);
    if (error) throw new Error(error.message);
  }
};

const DNA_PATH_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'guardian',
  'step_parent',
  'child',
]);

interface NameLookupRow {
  id: string;
  first_name: string;
  last_name: string | null;
  maiden_name: string | null;
}

interface RelationshipLookupRow {
  id: string;
  person_id: string;
  related_id: string;
  type?: RelationshipType;
  metadata?: Record<string, unknown> | null;
}

interface DnaMatchPayloadItem {
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
  personName: string;
  matchName: string;
  segmentCount: number;
  totalCentimorgans: number;
  largestSegmentCentimorgans: number;
  fileName?: string;
  importedAt?: string;
}

interface SharedAutosomalAdminRow {
  test_id: string;
  owner_person_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  counterpart_person_id: string | null;
  counterpart_first_name: string | null;
  counterpart_last_name: string | null;
  metadata: Record<string, unknown> | null;
}

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const tokenizeName = (value?: string | null) =>
  normalizeName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

const scoreNameMatch = (inputName: string, candidateName: string) => {
  const normalizedInput = normalizeName(inputName);
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedInput || !normalizedCandidate) return 0;
  if (normalizedInput === normalizedCandidate) return 1000;
  if (normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate)) {
    return 700;
  }
  const inputTokens = tokenizeName(normalizedInput);
  const candidateTokens = tokenizeName(normalizedCandidate);
  if (!inputTokens.length || !candidateTokens.length) return 0;
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  inputTokens.forEach((token) => {
    if (candidateSet.has(token)) overlap += 1;
  });
  if (!overlap) return 0;
  let score = overlap * 40;
  if (candidateTokens[0] === inputTokens[0]) score += 15;
  if (candidateTokens[candidateTokens.length - 1] === inputTokens[inputTokens.length - 1]) score += 30;
  if (candidateTokens.length === inputTokens.length) score += 10;
  return score;
};

const resolvePersonIdByName = (
  rawName: string | null | undefined,
  candidates: NameLookupRow[],
  excludedPersonId?: string
) => {
  const input = normalizeName(rawName);
  if (!input) return null;

  const ranked = candidates
    .filter((candidate) => !(excludedPersonId && candidate.id === excludedPersonId))
    .map((candidate) => {
      const displayName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
      const maidenName = `${candidate.first_name || ''} ${candidate.maiden_name || ''}`.trim();
      return {
        id: candidate.id,
        score: Math.max(scoreNameMatch(input, displayName), scoreNameMatch(input, maidenName)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const secondBest = ranked[1];
  if (!best || best.score < 60) return null;
  if (secondBest && best.score - secondBest.score < 5) return null;
  return best.id;
};

const deriveMatchConfidence = (sharedCM: number, segments: number): 'High' | 'Medium' | 'Low' => {
  if (sharedCM >= 90 || segments >= 6) return 'High';
  if (sharedCM >= 40 || segments >= 3) return 'Medium';
  return 'Low';
};

const extractYear = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

const toDisplayName = (row?: { first_name?: string | null; last_name?: string | null } | null) =>
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

const supportsRelationshipHops = (sharedCM: number | null, hops: number) => {
  if (!sharedCM || sharedCM <= 0) return true;
  if (sharedCM >= 1300) return hops <= 4;
  if (sharedCM >= 680) return hops <= 6;
  if (sharedCM >= 200) return hops <= 8;
  if (sharedCM >= 90) return hops <= 10;
  if (sharedCM >= 40) return hops <= 12;
  return hops <= 16;
};

const relationshipPredictionLabel = (sharedCM: number | null, segments: number | null) => {
  if (!sharedCM || sharedCM <= 0) return 'Insufficient cM data';
  if (sharedCM >= 2300) return 'Parent/Child or Full Sibling';
  if (sharedCM >= 1300) return 'Close family (1st-degree cluster)';
  if (sharedCM >= 680) return '1st cousin / great-grand relation cluster';
  if (sharedCM >= 200) return '2nd cousin cluster';
  if (sharedCM >= 90) return '3rd cousin cluster';
  if (sharedCM >= 40) return '4th cousin cluster';
  if ((segments || 0) >= 4) return 'Distant but likely related';
  return 'Very distant / uncertain';
};

const traversalLabel = (
  relationship: RelationshipLookupRow | undefined,
  fromPersonId: string,
  toPersonId: string
) => {
  if (!relationship?.type) return 'linked to';
  const forward = relationship.person_id === fromPersonId && relationship.related_id === toPersonId;
  const reverse = relationship.person_id === toPersonId && relationship.related_id === fromPersonId;
  if (!forward && !reverse) return 'linked to';
  const mapForwardParent = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'guardian', 'step_parent'];
  if (mapForwardParent.includes(relationship.type)) {
    return forward ? 'parent of' : 'child of';
  }
  if (relationship.type === 'child') {
    return forward ? 'child of' : 'parent of';
  }
  if (relationship.type === 'marriage' || relationship.type === 'partner') {
    return 'partner of';
  }
  return 'linked to';
};

const buildFullName = (firstName?: string | null, lastName?: string | null) =>
  `${firstName || ''} ${lastName || ''}`.trim();

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
  if (!personName && !matchName) return null;
  if (segmentCount == null || totalCentimorgans == null || largestSegmentCentimorgans == null) return null;
  return {
    personName,
    matchName,
    segmentCount,
    totalCentimorgans,
    largestSegmentCentimorgans,
    fileName: typeof summaryRaw.fileName === 'string'
      ? summaryRaw.fileName
      : typeof summaryRaw.file_name === 'string'
      ? summaryRaw.file_name
      : undefined,
    importedAt: typeof summaryRaw.importedAt === 'string'
      ? summaryRaw.importedAt
      : typeof summaryRaw.imported_at === 'string'
      ? summaryRaw.imported_at
      : undefined,
  };
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

const readSharedTestRowId = (row: any) =>
  typeof row?.test_id === 'string' ? row.test_id : typeof row?.id === 'string' ? row.id : null;

const readSharedTestOwnerId = (row: any) =>
  typeof row?.owner_person_id === 'string'
    ? row.owner_person_id
    : typeof row?.person_id === 'string'
    ? row.person_id
    : null;

const findRelationshipPath = (
  fromPersonId: string,
  toPersonId: string,
  relationshipRows: RelationshipLookupRow[]
) => {
  if (fromPersonId === toPersonId) {
    return { pathPersonIds: [fromPersonId], pathRelationshipIds: [] };
  }

  const adjacency = new Map<string, Array<{ nextPersonId: string; relationshipId: string }>>();
  relationshipRows.forEach((rel) => {
    const fromLinks = adjacency.get(rel.person_id) || [];
    fromLinks.push({ nextPersonId: rel.related_id, relationshipId: rel.id });
    adjacency.set(rel.person_id, fromLinks);

    const toLinks = adjacency.get(rel.related_id) || [];
    toLinks.push({ nextPersonId: rel.person_id, relationshipId: rel.id });
    adjacency.set(rel.related_id, toLinks);
  });

  const queue: string[] = [fromPersonId];
  const visited = new Set<string>([fromPersonId]);
  const previous = new Map<string, { previousPersonId: string; relationshipId: string }>();

  while (queue.length) {
    const current = queue.shift()!;
    if (current === toPersonId) break;
    const edges = adjacency.get(current) || [];
    edges.forEach((edge) => {
      if (visited.has(edge.nextPersonId)) return;
      visited.add(edge.nextPersonId);
      previous.set(edge.nextPersonId, {
        previousPersonId: current,
        relationshipId: edge.relationshipId,
      });
      queue.push(edge.nextPersonId);
    });
  }

  if (!visited.has(toPersonId)) return null;

  const pathPersonIds: string[] = [toPersonId];
  const pathRelationshipIds: string[] = [];
  let cursor = toPersonId;
  while (cursor !== fromPersonId) {
    const step = previous.get(cursor);
    if (!step) return null;
    pathRelationshipIds.push(step.relationshipId);
    pathPersonIds.push(step.previousPersonId);
    cursor = step.previousPersonId;
  }
  pathPersonIds.reverse();
  pathRelationshipIds.reverse();
  return { pathPersonIds, pathRelationshipIds };
};

const buildDnaMatchPayload = async (targetPersonId: string, dnaTests: DNATest[]): Promise<DnaMatchPayloadItem[]> => {
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

  const [peopleResponse, relationshipResponse] = await Promise.all([
    supabase
      .from('persons')
      .select('id, first_name, last_name, maiden_name')
      .eq('tree_id', personRow.tree_id),
    supabase
      .from('relationships')
      .select('id, person_id, related_id, type')
      .eq('tree_id', personRow.tree_id)
      .in('type', Array.from(DNA_PATH_RELATIONSHIP_TYPES))
  ]);

  if (peopleResponse.error) throw new Error(peopleResponse.error.message);
  if (relationshipResponse.error) throw new Error(relationshipResponse.error.message);

  const nameRows = (peopleResponse.data || []) as NameLookupRow[];
  const relationshipRows = (relationshipResponse.data || [])
    .filter((row) => !!row.id && !!row.person_id && !!row.related_id) as RelationshipLookupRow[];

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
        source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV',
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

const toDbPerson = (person: Person, treeId: string, userId?: string | null) => {
  const metadata: Record<string, any> = person.metadata ? { ...person.metadata } : {};
  if (person.alternateNames?.length) {
    metadata.alternateNames = person.alternateNames;
  }
  const encodePlace = (key: string, value?: string | StructuredPlace) => {
    if (!value) return null;
    if (typeof value === 'string') {
      return value;
    }
    metadata[`structured_${key}`] = value;
    return value.fullText || null;
  };
  return {
    id: randomId(),
    tree_id: treeId,
    created_by: userId ?? null,
    first_name: person.firstName || '',
    middle_name: null,
    last_name: person.lastName || '',
    maiden_name: person.maidenName || null,
    gender: person.gender || 'O',
    birth_date_text: person.birthDate || null,
    birth_place_text: encodePlace('birth_place', person.birthPlace) || null,
    death_date_text: person.deathDate || null,
    death_place_text: encodePlace('death_place', person.deathPlace) || null,
    burial_date_text: person.burialDate || null,
    burial_place_text: encodePlace('burial_place', person.burialPlace) || null,
    residence_at_death_text: normalizePlace(person.residenceAtDeath) || null,
    photo_url: person.photoUrl || null,
    bio: person.bio || null,
    occupations: person.occupations || [],
    is_dna_match: person.isDNAMatch || false,
    dna_match_info: person.dnaMatchInfo || null,
    is_living: typeof person.isLiving === 'boolean' ? person.isLiving : null,
    is_private: !!person.isPrivate,
    tags: [],
    user_role: person.userRole || null,
    metadata
  };
};

const mapDbPerson = (
  row: any,
  notesByPerson: Record<string, Note[]>,
  sourcesByPerson: Record<string, Source[]>,
  eventsByPerson: Record<string, PersonEvent[]>,
  citationsByPerson: Record<string, Citation[]>
) : Person => {
  const metadata = row.metadata || {};
  const structuredBirth = metadata.structured_birth_place;
  const structuredDeath = metadata.structured_death_place;
  const structuredBurial = metadata.structured_burial_place;
  return {
    id: row.id,
    treeId: row.tree_id,
    firstName: row.first_name,
    lastName: row.last_name,
    maidenName: row.maiden_name || undefined,
    gender: row.gender || 'O',
    birthDate: row.birth_date_text || undefined,
    birthPlace: structuredBirth || row.birth_place_text || undefined,
    deathDate: row.death_date_text || undefined,
    deathPlace: structuredDeath || row.death_place_text || undefined,
    burialDate: row.burial_date_text || undefined,
    burialPlace: structuredBurial || row.burial_place_text || undefined,
    residenceAtDeath: row.residence_at_death_text || undefined,
    photoUrl: row.photo_url || undefined,
    bio: row.bio || undefined,
    occupations: row.occupations || [],
    generation: row.generation || undefined,
    updatedAt: row.updated_at,
    isLiving: row.is_living === null ? undefined : row.is_living ?? undefined,
    isPrivate: !!row.is_private,
    isDNAMatch: row.is_dna_match,
    dnaMatchInfo: row.dna_match_info || undefined,
    addedByUserId: row.created_by || undefined,
    notes: notesByPerson[row.id] || [],
    sources: sourcesByPerson[row.id] || [],
    citations: citationsByPerson[row.id] || [],
    events: eventsByPerson[row.id] || [],
    mediaIds: [],
    alternateNames: metadata.alternateNames || [],
    metadata
  } as Person;
};

const mapDbTree = (row: any): FamilyTreeType => {
  const metadata = row.metadata || undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id ?? null,
    isPublic: !!row.is_public,
    themeColor: row.theme_color ?? undefined,
    metadata,
    defaultProbandId: metadata?.defaultProbandId ?? null,
    defaultProbandLabel: metadata?.defaultProbandLabel ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastModified: row.updated_at
  };
};

const mapBasicPeople = (rows: any[] = []) => {
  const noteMap: Record<string, Note[]> = {};
  const sourceMap: Record<string, Source[]> = {};
  const eventMap: Record<string, PersonEvent[]> = {};
  const citationMap: Record<string, Citation[]> = {};
  return rows.map((row) => mapDbPerson(row, noteMap, sourceMap, eventMap, citationMap));
};

const mapDbDnaTest = (row: any): DNATest => {
  const metadata = (row.metadata || {}) as Record<string, any>;
  return {
    id: row.id,
    type: row.test_type as DNATestType,
    vendor: row.vendor as DNAVendor,
    testDate:
      row.test_date ||
      metadata.testDate ||
      undefined,
    matchDate:
      row.match_date ||
      metadata.matchDate ||
      undefined,
    isPrivate: !!row.is_private,
    haplogroup: row.haplogroup || undefined,
    notes: row.notes || undefined,
    testNumber: metadata.testNumber || undefined,
    isConfirmed: typeof metadata.isConfirmed === 'boolean' ? metadata.isConfirmed : undefined,
    hvr1: metadata.hvr1 || undefined,
    hvr2: metadata.hvr2 || undefined,
    extraMutations: metadata.extraMutations || undefined,
    codingRegion: metadata.codingRegion || undefined,
    mostDistantAncestorId: metadata.mostDistantAncestorId || undefined,
    rawDataSummary: metadata.rawDataSummary || undefined,
    rawDataPreview: metadata.rawDataPreview || undefined,
    sharedMatchName: metadata.sharedMatchName || undefined,
    sharedMatchPersonId: metadata.sharedMatchPersonId || undefined,
    sharedSegmentSummary: metadata.sharedSegmentSummary || undefined,
    sharedSegmentsPreview: metadata.sharedSegmentsPreview || undefined,
    sharedPathPersonIds: metadata.sharedPathPersonIds || undefined,
    sharedPathRelationshipIds: metadata.sharedPathRelationshipIds || undefined,
  };
};

export const ensureTrees = async (): Promise<FamilyTreeType[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }
  const { data, error } = await supabase.rpc('admin_list_trees_with_counts');
  if (error) throw new Error(error.message);
  if (!data?.length) {
    return [];
  }
  return data.map((row: any) => mapDbTree(row));
};

export const fetchTreeStatistics = async (treeId: string): Promise<SupabaseTreeStatistics> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('tree_statistics', { target_tree_id: treeId });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error('Statistics not available for this tree.');
  }
  const parsed = data as SupabaseTreeStatistics;
  if (!Array.isArray(parsed.centuryStats)) {
    parsed.centuryStats = [];
  }
  return parsed;
};

export const createFamilyTree = async (
  payload: { name: string; description?: string; ownerName?: string; ownerEmail?: string },
  actor?: ImportActor | null
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot create tree.');
  }
  const metadata: Record<string, string> = {};
  if (payload.ownerName) metadata.owner_name = payload.ownerName;
  if (payload.ownerEmail) metadata.owner_email = payload.ownerEmail;
  const normalizedActor = normalizeActor(actor);
  const { data, error } = await supabase.rpc('admin_create_tree', {
    payload_name: payload.name,
    payload_description: payload.description || null,
    payload_metadata: metadata,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name
  });
  if (error) throw new Error(error.message);
  return mapDbTree(data);
};

export const listFamilyTreesWithCounts = async (): Promise<FamilyTreeSummary[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_list_trees_with_counts');
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    ...mapDbTree(row),
    personCount: Number(row.person_count || 0),
    relationshipCount: Number(row.relationship_count || 0)
  }));
};

export const deleteFamilyTreeRecord = async (treeId: string, actor?: ImportActor | null) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot delete tree.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_delete_tree', {
    target_tree_id: treeId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name
  });
  if (error) throw new Error(error.message);
};

export const updateTreeSettings = async (
  treeId: string,
  payload: {
    isPublic?: boolean;
    probandId?: string | null;
    probandLabel?: string | null;
    description?: string;
    ownerName?: string;
    ownerEmail?: string;
  },
  actor?: ImportActor | null
): Promise<FamilyTreeType> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Cannot update tree.');
  }
  const normalizedActor = normalizeActor(actor);
  const { data, error } = await supabase.rpc('admin_update_tree_settings', {
    target_tree_id: treeId,
    payload_is_public: typeof payload.isPublic === 'boolean' ? payload.isPublic : null,
    payload_proband_id: payload.probandId ?? null,
    payload_proband_label: payload.probandLabel ?? null,
    payload_description: payload.description !== undefined ? payload.description : null,
    payload_owner_name: payload.ownerName !== undefined ? payload.ownerName : null,
    payload_owner_email: payload.ownerEmail !== undefined ? payload.ownerEmail : null,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name,
  });
  if (error) throw new Error(error.message);
  return mapDbTree(data);
};

export const nukeSupabaseDatabase = async (confirmText = 'NUKE') => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const { error } = await supabase.rpc('admin_nuke_database', {
    confirm_text: confirmText
  });
  if (error) throw new Error(error.message);
};

export const loadArchiveData = async (treeId: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const personRows = await fetchPagedRows(async (from, to) => {
    const { data, error } = await supabase
      .from('persons')
      .select(
        'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, updated_at, metadata, is_living, is_private'
      )
      .eq('tree_id', treeId)
      .order('last_name', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

  const relationshipRows = await fetchPagedRows(async (from, to) => {
    const { data, error } = await supabase
      .from('relationships')
      .select('*')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

  const emptyNotes: Record<string, Note[]> = {};
  const emptySources: Record<string, Source[]> = {};
  const emptyEvents: Record<string, PersonEvent[]> = {};
  const emptyCitations: Record<string, Citation[]> = {};

  const people = personRows.map((row) => ({
    ...mapDbPerson(row, emptyNotes, emptySources, emptyEvents, emptyCitations),
    detailsLoaded: false
  }));
  const relationships = (relationshipRows || []).map((row) => ({
    id: row.id,
    treeId: row.tree_id,
    personId: row.person_id,
    relatedId: row.related_id,
    type: row.type,
    status: row.status || undefined,
    confidence: row.confidence || undefined,
    order: row.sort_order || undefined,
    notes: row.notes || undefined,
    metadata: row.metadata || undefined
  }));

  return { people, relationships };
};

export const fetchWhatsNewPeople = async (treeId: string, limit = 4): Promise<Person[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata, is_living, is_private'
    )
    .eq('tree_id', treeId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return mapBasicPeople(data || []);
};

export const fetchThisMonthHighlights = async (treeId: string, limit = 3): Promise<Person[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const currentMonth = new Date().getMonth();
  const { data, error } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata, is_living, is_private'
    )
    .eq('tree_id', treeId)
    .not('birth_date_text', 'is', null)
    .limit(200);
  if (error) throw new Error(error.message);
  const filtered = (data || []).filter((row) => {
    if (!row.birth_date_text) return false;
    const parsed = new Date(row.birth_date_text);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getMonth() === currentMonth;
  });
  return mapBasicPeople(filtered.slice(0, limit));
};

export const fetchMostWantedPeople = async (treeId: string, limit = 4): Promise<Person[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata, is_living, is_private'
    )
    .eq('tree_id', treeId)
    .or('birth_date_text.is.null,photo_url.is.null,bio.is.null')
    .order('updated_at', { ascending: false })
    .limit(limit * 3);
  if (error) throw new Error(error.message);
  const prioritized = (data || []).slice(0, limit);
  return mapBasicPeople(prioritized);
};

export const fetchRandomMediaPeople = async (treeId: string, limit = 4): Promise<Person[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata, is_living, is_private'
    )
    .eq('tree_id', treeId)
    .not('photo_url', 'is', null)
    .limit(20);
  if (error) throw new Error(error.message);
  const shuffled = (data || []).sort(() => Math.random() - 0.5);
  return mapBasicPeople(shuffled.slice(0, limit));
};

export const fetchPersonConnections = async (
  treeId: string,
  personId: string
): Promise<{ relationships: Relationship[]; people: Person[] }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data: relationshipRows, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('tree_id', treeId)
    .or(`person_id.eq.${personId},related_id.eq.${personId}`);

  if (error) throw new Error(error.message);

  const parentTypes = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'];
  const spouseIds = new Set<string>();
  const sharedChildIds = new Set<string>();

  (relationshipRows || []).forEach((row) => {
    if (row.type === 'marriage' || row.type === 'partner') {
      const otherId = row.person_id === personId ? row.related_id : row.person_id;
      if (otherId) spouseIds.add(otherId);
    }
    if (parentTypes.includes(row.type) && row.person_id === personId && row.related_id) {
      sharedChildIds.add(row.related_id);
    }
  });

  if (spouseIds.size && sharedChildIds.size) {
    const { data: coparentRows, error: coparentError } = await supabase
      .from('relationships')
      .select('*')
      .eq('tree_id', treeId)
      .in('person_id', Array.from(spouseIds))
      .in('related_id', Array.from(sharedChildIds))
      .in('type', parentTypes);
    if (coparentError) throw new Error(coparentError.message);
    coparentRows?.forEach((row) => {
      if (!relationshipRows?.some((existing) => existing.id === row.id)) {
        relationshipRows?.push(row);
      }
    });
  }

  const relationships = (relationshipRows || []).map((row) => ({
    id: row.id,
    treeId: row.tree_id,
    personId: row.person_id,
    relatedId: row.related_id,
    type: row.type,
    status: row.status || undefined,
    confidence: row.confidence || undefined,
    order: row.sort_order || undefined,
    notes: row.notes || undefined,
    metadata: row.metadata || undefined
  }));

  const relatedIds = Array.from(
    new Set(
      relationships.reduce<string[]>((acc, rel) => {
        if (rel.personId) acc.push(rel.personId);
        if (rel.relatedId) acc.push(rel.relatedId);
        return acc;
      }, [])
    )
  );
  if (!relatedIds.includes(personId)) {
    relatedIds.push(personId);
  }

  const { data: peopleRows, error: peopleError } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, metadata, updated_at, is_living, is_private'
    )
    .in('id', relatedIds);

  if (peopleError) throw new Error(peopleError.message);

  return {
    relationships,
    people: mapBasicPeople(peopleRows || [])
  };
};

export interface UpdatePersonProfilePayload {
  actorId?: string | null;
  actorName?: string | null;
  profile: Record<string, any>;
  events?: any[];
  notes?: any[];
  sources?: any[];
  dnaTests?: DNATest[];
}

export const updatePersonProfile = async (
  personId: string,
  payload: UpdatePersonProfilePayload
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(
    payload.actorId || payload.actorName
      ? { id: payload.actorId ?? null, name: payload.actorName ?? undefined }
      : null
  );
  const { data, error } = await supabase.rpc('admin_update_person_profile', {
    target_person_id: personId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: payload.actorName ?? normalizedActor.name,
    payload_profile: payload.profile,
    payload_events: payload.events ?? [],
    payload_notes: payload.notes ?? [],
    payload_sources: payload.sources ?? []
  });
  if (error) throw new Error(error.message);

  let dnaMatchesPayload: DnaMatchPayloadItem[] = [];
  if (payload.dnaTests?.length) {
    try {
      dnaMatchesPayload = await buildDnaMatchPayload(personId, payload.dnaTests);
    } catch (err) {
      console.warn('Could not derive DNA match lineage paths', err);
    }
  }

  const sharedLineageByTestId = new Map<
    string,
    { matchedPersonId: string; pathPersonIds: string[]; pathRelationshipIds: string[] }
  >();
  dnaMatchesPayload.forEach((item) => {
    const sourceTestId =
      item.metadata && typeof item.metadata.test_id === 'string'
        ? (item.metadata.test_id as string)
        : null;
    if (!sourceTestId || sharedLineageByTestId.has(sourceTestId)) return;
    sharedLineageByTestId.set(sourceTestId, {
      matchedPersonId: item.matched_person_id,
      pathPersonIds: item.path_person_ids || [],
      pathRelationshipIds: item.path_relationship_ids || [],
    });
  });

  const dnaTestsPayload = (payload.dnaTests || []).map((test) => {
    const lineage = sharedLineageByTestId.get(test.id);
    const sharedMatchPersonId = lineage?.matchedPersonId || test.sharedMatchPersonId || null;
    const sharedPathPersonIds = lineage?.pathPersonIds || test.sharedPathPersonIds || null;
    const sharedPathRelationshipIds =
      lineage?.pathRelationshipIds || test.sharedPathRelationshipIds || null;
    return {
    id: test.id,
    type: test.type,
    vendor: test.vendor,
    testDate: test.testDate || null,
    matchDate: test.matchDate || null,
    testNumber: test.testNumber || null,
    isConfirmed: typeof test.isConfirmed === 'boolean' ? test.isConfirmed : null,
    hvr1: test.hvr1 || null,
    hvr2: test.hvr2 || null,
    extraMutations: test.extraMutations || null,
    codingRegion: test.codingRegion || null,
    mostDistantAncestorId: test.mostDistantAncestorId || null,
    rawDataSummary: test.rawDataSummary || null,
    rawDataPreview: test.rawDataPreview || null,
    sharedMatchName: test.sharedMatchName || null,
    sharedMatchPersonId,
    sharedSegmentSummary: test.sharedSegmentSummary || null,
    sharedSegmentsPreview: test.sharedSegmentsPreview || null,
    sharedPathPersonIds,
    sharedPathRelationshipIds,
    haplogroup: test.haplogroup || null,
    isPrivate: !!test.isPrivate,
    notes: test.notes || null,
    metadata: {
      testNumber: test.testNumber || null,
      isConfirmed: typeof test.isConfirmed === 'boolean' ? test.isConfirmed : null,
      hvr1: test.hvr1 || null,
      hvr2: test.hvr2 || null,
      extraMutations: test.extraMutations || null,
      codingRegion: test.codingRegion || null,
      mostDistantAncestorId: test.mostDistantAncestorId || null,
      rawDataSummary: test.rawDataSummary || null,
      rawDataPreview: test.rawDataPreview || null,
      sharedMatchName: test.sharedMatchName || null,
      sharedMatchPersonId,
      sharedSegmentSummary: test.sharedSegmentSummary || null,
      sharedSegmentsPreview: test.sharedSegmentsPreview || null,
      sharedPathPersonIds,
      sharedPathRelationshipIds
    }
  };
  });

  const { error: dnaError } = await supabase.rpc('admin_upsert_person_dna_tests', {
    target_person_id: personId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: payload.actorName ?? normalizedActor.name,
    payload_dna_tests: dnaTestsPayload,
    payload_dna_matches: dnaMatchesPayload
  });
  if (dnaError) throw new Error(dnaError.message);
  return data;
};

export const updateRelationshipConfidence = async (
  relationshipId: string,
  confidence: RelationshipConfidence,
  actor?: { id?: string | null; name?: string | null }
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_set_relationship_confidence', {
    target_relationship_id: relationshipId,
    payload_confidence: confidence,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name
  });
  if (error) throw new Error(error.message);
};

export const unlinkRelationship = async (
  relationshipId: string,
  actor?: { id?: string | null; name?: string | null }
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_unlink_relationship', {
    target_relationship_id: relationshipId,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name
  });
  if (error) throw new Error(error.message);
};

export const searchPersonsInTree = async (
  treeId: string,
  term: string,
  options: {
    limit?: number;
    offset?: number;
    filters?: {
      livingOnly?: boolean;
      deceasedOnly?: boolean;
      missingData?: boolean;
      gender?: 'M' | 'F';
    };
  } = {}
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const limit = options.limit ?? 40;
  const offset = options.offset ?? 0;
  const sanitizedTerms = term
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/[%_]/g, '\\$&'));

  let query = supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, burial_date_text, burial_place_text, residence_at_death_text, metadata, bio, occupations, updated_at, created_by, is_dna_match, dna_match_info, is_living, is_private',
      { count: 'exact' }
    )
    .eq('tree_id', treeId)
    .order('last_name', { ascending: true })
    .range(offset, offset + limit - 1);

  sanitizedTerms.forEach((token) => {
    const pattern = `%${token}%`;
    query = query.or(
      [
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `maiden_name.ilike.${pattern}`,
        `birth_date_text.ilike.${pattern}`,
        `death_date_text.ilike.${pattern}`,
        `birth_place_text.ilike.${pattern}`,
        `death_place_text.ilike.${pattern}`,
        `bio.ilike.${pattern}`
      ].join(',')
    );
  });

  if (options.filters?.livingOnly) {
    query = query.or('is_living.eq.true,death_date_text.is.null');
  }

  if (options.filters?.deceasedOnly) {
    query = query.or('is_living.eq.false,death_date_text.not.is.null');
  }

  if (options.filters?.gender) {
    query = query.eq('gender', options.filters.gender);
  }

  if (options.filters?.missingData) {
    query = query.or('birth_date_text.is.null,death_date_text.is.null,birth_place_text.is.null,death_place_text.is.null');
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const emptyNotes: Record<string, Note[]> = {};
  const emptySources: Record<string, Source[]> = {};
  const emptyEvents: Record<string, PersonEvent[]> = {};
  const emptyCitations: Record<string, Citation[]> = {};

  return {
    total: count ?? 0,
    results: (data ?? []).map((row) => mapDbPerson(row, emptyNotes, emptySources, emptyEvents, emptyCitations))
  };
};

export const listAutosomalPeopleInTree = async (treeId: string): Promise<DNAAutosomalCandidate[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const people = await fetchPagedRows<any>(async (from, to) => {
    const { data, error } = await supabase
      .from('persons')
      .select('id, first_name, last_name, birth_date_text, death_date_text')
      .eq('tree_id', treeId)
      .order('last_name', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

  if (!people.length) return [];

  const personById = new Map<string, any>();
  people.forEach((row) => personById.set(row.id, row));

  const autosomalCounts = new Map<string, number>();
  for (let i = 0; i < people.length; i += 500) {
    const batchIds = people.slice(i, i + 500).map((row) => row.id);
    const { data, error } = await supabase
      .from('dna_tests')
      .select('person_id')
      .eq('test_type', 'Autosomal')
      .in('person_id', batchIds);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row: any) => {
      autosomalCounts.set(row.person_id, (autosomalCounts.get(row.person_id) || 0) + 1);
    });
  }

  const candidates = Array.from(autosomalCounts.entries())
    .map(([personId, autosomalTestCount]) => {
      const person = personById.get(personId);
      if (!person) return null;
      return {
        personId,
        name: toDisplayName(person),
        birthYear: extractYear(person.birth_date_text),
        deathYear: extractYear(person.death_date_text),
        autosomalTestCount
      } as DNAAutosomalCandidate;
    })
    .filter((item): item is DNAAutosomalCandidate => !!item)
    .sort((a, b) => a.name.localeCompare(b.name));

  return candidates;
};

export const listSharedMatchesForAutosomalPerson = async (
  treeId: string,
  focusPersonId: string
): Promise<DNASharedMatchRecord[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }

  const peopleRows = await fetchPagedRows<any>(async (from, to) => {
    const { data, error } = await supabase
      .from('persons')
      .select('id, tree_id, first_name, last_name')
      .eq('tree_id', treeId)
      .order('last_name', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  const personById = new Map<string, any>();
  peopleRows.forEach((row) => personById.set(row.id, row));
  if (!personById.has(focusPersonId)) return [];

  const nameRows: NameLookupRow[] = peopleRows.map((row) => ({
    id: row.id,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    maiden_name: null
  }));
  const focusFullName = buildFullName(
    personById.get(focusPersonId)?.first_name,
    personById.get(focusPersonId)?.last_name
  );

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('relationships')
    .select('id, person_id, related_id, type')
    .eq('tree_id', treeId)
    .in('type', Array.from(DNA_PATH_RELATIONSHIP_TYPES));
  if (relationshipError) throw new Error(relationshipError.message);
  const typedRelationships = (relationshipRows || []) as RelationshipLookupRow[];

  const { data: matchRows, error: matchError } = await supabase
    .from('dna_matches')
    .select('id, person_id, matched_person_id, shared_cm, segments, longest_segment, confidence, metadata, created_at')
    .or(`person_id.eq.${focusPersonId},matched_person_id.eq.${focusPersonId}`)
    .order('shared_cm', { ascending: false });
  if (matchError) throw new Error(matchError.message);

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
    const pathPersonIds = ensureStringArray(metadata.path_person_ids);
    const pathRelationshipIds = ensureStringArray(metadata.path_relationship_ids);
    const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
    const sharedCM = toNumberOrNull(row.shared_cm);
    const segments = toNumberOrNull(row.segments);
    const longestSegment = toNumberOrNull(row.longest_segment);
    const predictionLabel = relationshipPredictionLabel(sharedCM, segments);
    const pathFitsPrediction = pathFound ? supportsRelationshipHops(sharedCM, pathRelationshipIds.length) : false;
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
      importedAt: typeof metadata.imported_at === 'string' ? metadata.imported_at : undefined
    });
  });

  const personIds = peopleRows.map((row) => row.id);
  const sharedTests: any[] = [];
  const { data: sharedAdminData, error: sharedAdminError } = await supabase.rpc(
    'admin_list_tree_shared_autosomal_tests',
    { target_tree_id: treeId }
  );
  if (!sharedAdminError && Array.isArray(sharedAdminData)) {
    sharedTests.push(...(sharedAdminData as SharedAutosomalAdminRow[]));
  } else {
    for (let i = 0; i < personIds.length; i += 500) {
      const batchIds = personIds.slice(i, i + 500);
      const { data, error } = await supabase
        .from('dna_tests')
        .select('id, person_id, metadata')
        .eq('test_type', 'Shared Autosomal')
        .in('person_id', batchIds);
      if (error) throw new Error(error.message);
      sharedTests.push(...(data || []));
    }
  }

  sharedTests.forEach((testRow) => {
    const testId = readSharedTestRowId(testRow);
    const ownerPersonId = readSharedTestOwnerId(testRow);
    if (!testId || !ownerPersonId) return;
    if (existingTestIds.has(testId)) return;
    const metadata = asRecord(testRow.metadata);
    const ownerPersonRow =
      personById.get(ownerPersonId) ||
      ({
        first_name: testRow.owner_first_name || '',
        last_name: testRow.owner_last_name || '',
      } as any);
    const explicitMatchPersonId = readSharedMatchPersonId(metadata);
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
    if (rpcCounterpartId) {
      if (ownerPersonId === focusPersonId && rpcCounterpartId !== focusPersonId) {
        counterpartPersonId = rpcCounterpartId;
      } else if (rpcCounterpartId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }
    if (explicitMatchPersonId) {
      if (ownerPersonId === focusPersonId && explicitMatchPersonId !== focusPersonId) {
        counterpartPersonId = explicitMatchPersonId;
      } else if (explicitMatchPersonId === focusPersonId && ownerPersonId !== focusPersonId) {
        counterpartPersonId = ownerPersonId;
      }
    }

    const summary = summaryFromDnaTestMetadata(metadata);
    const focusNamedInSummary =
      !!summary &&
      (scoreNameMatch(focusFullName, summary.personName) >= 60 ||
        scoreNameMatch(focusFullName, summary.matchName) >= 60);
    // If the CSV summary names the selected focus person and this test belongs to someone else,
    // that owner is the counterpart regardless of a stale/mismapped sharedMatchPersonId.
    if (!counterpartPersonId && focusNamedInSummary && ownerPersonId !== focusPersonId) {
      counterpartPersonId = ownerPersonId;
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
    if (!summary || !counterpartPersonId) return;
    if (!counterpartPersonId || counterpartPersonId === focusPersonId) return;
    const pairKey = [focusPersonId, counterpartPersonId].sort().join(':');
    if (existingPairs.has(pairKey)) return;

    const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRelationships);
    const pathPersonIds = path?.pathPersonIds || [];
    const pathRelationshipIds = path?.pathRelationshipIds || [];
    const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
    const predictionLabel = relationshipPredictionLabel(summary.totalCentimorgans, summary.segmentCount);
    const pathFitsPrediction = pathFound
      ? supportsRelationshipHops(summary.totalCentimorgans, pathRelationshipIds.length)
      : false;

    const counterpartNameFromPeople = personById.has(counterpartPersonId)
      ? toDisplayName(personById.get(counterpartPersonId))
      : null;
    const counterpartNameFromRpc = rpcCounterpartRow ? toDisplayName(rpcCounterpartRow) : null;
    const counterpartPersonName =
      counterpartNameFromPeople ||
      counterpartNameFromRpc ||
      summary.matchName ||
      'Unknown';

    results.push({
      id: `test:${testId}`,
      source: 'dna_test',
      dnaTestId: testId,
      ownerPersonId,
      ownerPersonName: toDisplayName(ownerPersonRow),
      counterpartPersonId,
      counterpartPersonName,
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
      importedAt: summary.importedAt
    });
  });

  return results.sort((a, b) => (b.sharedCM ?? 0) - (a.sharedCM ?? 0));
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

export const resolveSharedMatchLineage = async (
  treeId: string,
  focusPersonId: string,
  dnaMatchId: string,
  actor?: ImportActor | null
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

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('relationships')
    .select('id, tree_id, person_id, related_id, type')
    .eq('tree_id', treeId)
    .in('type', Array.from(DNA_PATH_RELATIONSHIP_TYPES));
  if (relationshipError) throw new Error(relationshipError.message);

  const typedRows = (relationshipRows || []) as RelationshipLookupRow[];
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
  const pathFitsPrediction = pathFound
    ? supportsRelationshipHops(sharedCM, pathRelationshipIds.length)
    : false;

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
          metadata: {
            ...dnaTestMetadata,
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

  const relationshipById = new Map<string, RelationshipLookupRow>();
  typedRows.forEach((row) => relationshipById.set(row.id, row));
  const pathLabel = pathPersonIds.length
    ? pathPersonIds
        .map((personId, index) => {
          const name = pathNames.get(personId) || personId;
          if (index === pathPersonIds.length - 1) return name;
          const nextPersonId = pathPersonIds[index + 1];
          const relationshipId = pathRelationshipIds[index];
          const relationship = relationshipById.get(relationshipId);
          return `${name} -> ${traversalLabel(relationship, personId, nextPersonId)}`;
        })
        .join(' ')
    : 'No lineage path found';

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
  actor?: ImportActor | null
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

  const { data: relationshipRows, error: relationshipError } = await supabase
    .from('relationships')
    .select('id, tree_id, person_id, related_id, type')
    .eq('tree_id', treeId)
    .in('type', Array.from(DNA_PATH_RELATIONSHIP_TYPES));
  if (relationshipError) throw new Error(relationshipError.message);

  const typedRows = (relationshipRows || []) as RelationshipLookupRow[];
  const path = findRelationshipPath(focusPersonId, counterpartPersonId, typedRows);
  const pathPersonIds = path?.pathPersonIds || [];
  const pathRelationshipIds = path?.pathRelationshipIds || [];
  const pathFound = pathPersonIds.length > 1 && pathRelationshipIds.length > 0;
  const predictionLabel = relationshipPredictionLabel(summary.totalCentimorgans, summary.segmentCount);
  const pathFitsPrediction = pathFound
    ? supportsRelationshipHops(summary.totalCentimorgans, pathRelationshipIds.length)
    : false;

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
    source: 'FTDNA_SHARED_AUTOSOMAL_SEGMENTS_CSV',
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
  if (matchId) {
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
      metadata: {
        ...testMetadata,
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
  const relationshipById = new Map<string, RelationshipLookupRow>();
  typedRows.forEach((row) => relationshipById.set(row.id, row));
  const pathLabel = pathPersonIds.length
    ? pathPersonIds
        .map((personId, index) => {
          const name = pathNames.get(personId) || personId;
          if (index === pathPersonIds.length - 1) return name;
          const nextPersonId = pathPersonIds[index + 1];
          const relationshipId = pathRelationshipIds[index];
          return `${name} -> ${traversalLabel(relationshipById.get(relationshipId), personId, nextPersonId)}`;
        })
        .join(' ')
    : 'No lineage path found';

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

export const persistFamilyLayout = async (
  personId: string,
  treeId: string,
  layout: FamilyLayoutState,
  actor?: ImportActor | null,
  existingMetadata?: Record<string, unknown>
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const metadata = { ...(existingMetadata || {}), familyLayout: layout };
  const { data, error } = await supabase
    .from('persons')
    .update({ metadata })
    .eq('id', personId)
    .select('metadata')
    .single();
  if (error) throw new Error(error.message);

  const normalizedActor = normalizeActor(actor);
  await recordAuditLogs([
    {
      tree_id: treeId,
      actor_id: normalizedActor.id,
      actor_name: normalizedActor.name,
      action: 'family_layout_update',
      entity_type: 'person',
      entity_id: personId,
      details: { layout }
    }
  ]);

  return (data?.metadata as Record<string, unknown>) || metadata;
};

export const fetchPersonDetails = async (personId: string): Promise<Person> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data: personRow, error } = await supabase.from('persons').select('*').eq('id', personId).single();
  if (error || !personRow) {
    throw new Error(error?.message || 'Person not found');
  }

  const [noteRows, eventRows, citationRows, dnaRows] = await Promise.all([
    supabase.from('notes').select('*').eq('person_id', personId),
    supabase.from('person_events').select('*').eq('person_id', personId),
    supabase.from('citations').select('*').eq('person_id', personId),
    supabase.from('dna_tests').select('*').eq('person_id', personId)
  ]);

  if (noteRows.error) throw new Error(noteRows.error.message);
  if (eventRows.error) throw new Error(eventRows.error.message);
  if (citationRows.error) throw new Error(citationRows.error.message);
  if (dnaRows.error) throw new Error(dnaRows.error.message);

  const noteMap: Record<string, Note[]> = {};
  const eventMap: Record<string, PersonEvent[]> = {};
  const citationMap: Record<string, Citation[]> = {};
  const sourceMap: Record<string, Source[]> = {};

  if (noteRows.data) {
    noteMap[personId] = noteRows.data.map((note) => ({
      id: note.id,
      text: note.body,
      type: note.type,
      event: note.event_label || undefined,
      date: note.note_date_text || undefined,
      isPrivate: note.is_private || false
    }));
  }

  if (eventRows.data) {
    eventMap[personId] = eventRows.data.map((event) => ({
      id: event.id,
      type: event.event_type,
      date: event.date_text || undefined,
      place: event.place_text || undefined,
      description: event.description || undefined,
      employer: event.employer || undefined
    }));
  }

  const citationList = citationRows.data ?? [];
  if (citationList.length) {
    const sourceIds = Array.from(new Set(citationList.map((c) => c.source_id).filter(Boolean)));
    const sourceRows = sourceIds.length
      ? await supabase.from('sources').select('*').in('id', sourceIds)
      : { data: [], error: null };
    if (sourceRows.error) throw new Error(sourceRows.error.message);
    const sourceLookup = new Map<string, any>();
    (sourceRows.data || []).forEach((row) => sourceLookup.set(row.id, row));

    citationMap[personId] = [];
    sourceMap[personId] = [];
    citationList.forEach((citation: any) => {
      const src = sourceLookup.get(citation.source_id);
      if (!src) return;
      const extra = (citation as any)?.extra || {};
      const inlineNotes = extra.inline_notes as string | undefined;
      const entry: Citation = {
        id: citation.id,
        sourceId: citation.source_id,
        eventLabel: citation.event_label || undefined,
        label: citation.label || undefined,
        page: citation.page_text || src.page || undefined,
        dataDate: citation.data_date || extra.data_date || undefined,
        dataText: citation.data_text || extra.data_text || undefined,
        quality: citation.quality || extra.quality || undefined,
        extra
      };
      citationMap[personId]!.push(entry);
      sourceMap[personId]!.push({
        id: `${src.id}:${citation.id}`,
        externalId: src.id,
        title: src.title,
        type: src.type,
        repository: src.repository || undefined,
        url: src.url || undefined,
        citationDate: src.citation_date_text || undefined,
        page: citation.page_text || src.page || undefined,
        reliability: src.reliability || undefined,
        actualText: src.actual_text || undefined,
        abbreviation: src.abbreviation || undefined,
        callNumber: src.call_number || undefined,
        notes: inlineNotes || undefined,
        event: citation.event_label || 'General'
      });
    });
  }

  const person = mapDbPerson(personRow, noteMap, sourceMap, eventMap, citationMap);
  return {
    ...person,
    dnaTests: (dnaRows.data || []).map(mapDbDnaTest),
    detailsLoaded: true
  };
};

export const fetchFamilyLayoutAudits = async (treeId: string, limit = 10, offset = 0): Promise<{ audits: FamilyLayoutAudit[]; total: number }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id, tree_id, actor_id, actor_name, created_at, details')
      .eq('tree_id', treeId)
      .eq('action', 'family_layout_update')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tree_id', treeId)
      .eq('action', 'family_layout_update')
  ]);
  if (error) throw new Error(error.message);
  const audits = (data || []).map((row: any) => ({
    id: row.id,
    treeId: row.tree_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
    layout: (row.details?.layout || {}) as FamilyLayoutState
  }));
  return { audits, total: count || 0 };
};

export const createPlaceholderParent = async ({
  treeId,
  childId,
  parentType,
  actor,
}: {
  treeId: string;
  childId: string;
  parentType: 'father' | 'mother';
  actor?: ImportActor | null;
}): Promise<Person> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const parentId = randomId();
  const defaultGender = parentType === 'father' ? 'M' : 'F';
  const metadata: Record<string, any> = {
    createdVia: 'manual_parent_button',
  };

  const { data: parentRow, error: parentError } = await supabase
    .from('persons')
    .insert({
      id: parentId,
      tree_id: treeId,
      first_name: '',
      last_name: '',
      maiden_name: null,
      gender: defaultGender,
      birth_date_text: null,
      death_date_text: null,
      birth_place_text: null,
      death_place_text: null,
      burial_date_text: null,
      burial_place_text: null,
      residence_at_death_text: null,
      metadata,
      bio: null,
      occupations: [],
      created_by: normalizedActor.id,
      is_private: true,
      is_dna_match: false,
      dna_match_info: null,
      is_living: null,
      tags: [],
      user_role: null,
    })
    .select(
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, burial_date_text, burial_place_text, residence_at_death_text, metadata, bio, occupations, updated_at, created_by, is_dna_match, dna_match_info, is_living, is_private'
    )
    .single();

  if (parentError) {
    throw new Error(parentError.message);
  }

  const newRelationship = {
    id: randomId(),
    tree_id: treeId,
    person_id: parentRow.id,
    related_id: childId,
    type: parentType === 'father' ? 'bio_father' : 'bio_mother',
    status: 'current',
    confidence: 'Unknown',
    metadata: {
      createdVia: 'manual_parent_button',
    },
  };

  const { error: relError } = await supabase.from('relationships').insert(newRelationship as any);
  if (relError) {
    throw new Error(relError.message);
  }

  return mapDbPerson(parentRow, {}, {}, {}, {});
};

interface ImportActor {
  id?: string | null;
  name?: string | null;
}

const recordAuditLogs = async (entries: Array<{ tree_id: string; actor_id: string | null; actor_name: string; action: string; entity_type: string; entity_id: string; details?: Record<string, unknown> }>) => {
  if (!entries.length || !isSupabaseConfigured()) return;
  await supabase.from('audit_logs').insert(entries);
};

export const importGedcomToSupabase = async (treeId: string, data: { people: Person[]; relationships: Relationship[] }, actor?: ImportActor | null) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const userId = normalizedActor.id;
  const actorName = normalizedActor.name;
  const personIdMap = new Map<string, string>();
  const personRows = data.people.map((person) => {
    const row = toDbPerson(person, treeId, userId);
    if (person.metadata?.familyLayout) {
      row.metadata = {
        ...row.metadata,
        familyLayout: person.metadata.familyLayout
      };
    }
    personIdMap.set(person.id, row.id);
    return row;
  });
  const relationshipRows = data.relationships.map((rel) => {
    const personId = personIdMap.get(rel.personId);
    const relatedId = personIdMap.get(rel.relatedId);
    if (!personId || !relatedId) return null;
    return {
      id: randomId(),
      tree_id: treeId,
      person_id: personId,
      related_id: relatedId,
      type: rel.type,
      status: rel.status || null,
      confidence: rel.confidence || null,
      notes: rel.notes || null,
      sort_order: rel.order || null,
      metadata: rel.metadata ? rel.metadata : {}
    };
  }).filter(Boolean);

  const events: any[] = [];
  const notes: any[] = [];
  const sources: any[] = [];
  const citations: any[] = [];
  const sourceExternalToDbId = new Map<string, string>();
  const sourceLocalToDbId = new Map<string, string>();
  const auditEntries: Array<{ tree_id: string; actor_id: string | null; actor_name: string; action: string; entity_type: string; entity_id: string; details?: Record<string, unknown> }> = [];

  if (personRows.length) {
    await chunkedInsert('persons', personRows);
    personRows.forEach((row) => {
      auditEntries.push({
        tree_id: treeId,
        actor_id: userId,
        actor_name: actorName,
        action: 'person_import',
        entity_type: 'person',
        entity_id: row.id,
        details: { source: 'GEDCOM' }
      });
    });
  }

  if (relationshipRows.length) {
    await chunkedInsert('relationships', relationshipRows as any[]);
    (relationshipRows as any[]).forEach((row: any) => {
      auditEntries.push({
        tree_id: treeId,
        actor_id: userId,
        actor_name: actorName,
        action: 'relationship_import',
        entity_type: 'relationship',
        entity_id: row.id,
        details: { source: 'GEDCOM', type: row.type }
      });
    });
  }

  data.people.forEach((person) => {
    const personId = personIdMap.get(person.id);
    if (!personId) return;
    (person.events || []).forEach((event) => {
      if (['Birth', 'Death'].includes(event.type)) return;
      events.push({
        id: randomId(),
        person_id: personId,
        event_type: event.type,
        date_text: event.date || null,
        place_text: normalizePlace(event.place),
        description: event.description || null,
        employer: event.employer || null
      });
    });
    (person.notes || []).forEach((note) => {
      notes.push({
        id: randomId(),
        tree_id: treeId,
        person_id: personId,
        type: note.type || 'Research Note',
        body: note.text,
        event_label: note.event || 'General',
        note_date_text: note.date || null,
        is_private: note.isPrivate || false
      });
    });
    (person.sources || []).forEach((source, index) => {
      const externalKey = source.externalId || source.id || `${person.id}-source-${index}`;
      let sourceId = sourceExternalToDbId.get(externalKey);
      if (!sourceId) {
        sourceId = randomId();
        sourceExternalToDbId.set(externalKey, sourceId);
        const baseNotes = source.event === 'General' ? (source.notes || null) : null;
        const basePage = source.event === 'General' ? (source.page || null) : null;
        sources.push({
          id: sourceId,
          tree_id: treeId,
          title: source.title || 'Untitled Record',
          type: source.type || 'Unknown',
          repository: source.repository || null,
          url: source.url || null,
          citation_date_text: source.citationDate || null,
          page: basePage,
          reliability: source.reliability || null,
          actual_text: source.actualText || null,
          notes: baseNotes,
          abbreviation: source.abbreviation || null,
          call_number: source.callNumber || null
        });
      }
      const localKey = source.id || source.externalId || externalKey;
      if (localKey) {
        sourceLocalToDbId.set(localKey, sourceId);
      }
      const inlineNotes = source.event === 'General' ? null : (source.notes || null);
      // legacy general association without citation metadata
      if (!person.citations?.length) {
        citations.push({
          id: randomId(),
          tree_id: treeId,
          source_id: sourceId,
          person_id: personId,
          event_label: source.event || 'General',
          label: source.title || source.event || 'Citation',
          page_text: source.page || null,
          extra: inlineNotes ? { inline_notes: inlineNotes } : {}
        });
      }
    });

    (person.citations || []).forEach((citation) => {
      const lookupId =
        sourceLocalToDbId.get(citation.sourceId) ||
        sourceExternalToDbId.get(citation.sourceId);
      if (!lookupId) return;
      citations.push({
        id: randomId(),
        tree_id: treeId,
        source_id: lookupId,
        person_id: personId,
        event_label: citation.eventLabel || null,
        label: citation.label || null,
        page_text: citation.page || null,
        data_date: citation.dataDate || citation.extra?.data_date || null,
        data_text: citation.dataText || citation.extra?.data_text || null,
        quality: citation.quality || citation.extra?.quality || null,
        extra: citation.extra || {}
      });
    });
  });

  if (events.length) {
    await chunkedInsert('person_events', events);
  }
  if (notes.length) {
    await chunkedInsert('notes', notes);
  }
  if (sources.length) {
    await chunkedInsert('sources', sources);
  }
  if (citations.length) {
    await chunkedInsert('citations', citations);
  }

  await recordAuditLogs(auditEntries);

  await supabase.from('gedcom_imports').insert({
    tree_id: treeId,
    uploaded_by: userId || null,
    file_name: `import-${Date.now()}.ged`,
    status: 'completed',
    stats: { people: personRows.length, relationships: relationshipRows.length }
  });
  console.info('[Linegra] GEDCOM import synced to Supabase', {
    treeId,
    people: personRows.length,
    relationships: relationshipRows.length,
    events: events.length,
    sources: sources.length,
    citations: citations.length
  });
};
export interface SupabaseTreeStatistics {
  totalIndividuals: number;
  maleCount: number;
  femaleCount: number;
  unknownGenderCount: number;
  livingCount: number;
  deceasedCount: number;
  marriages: number;
  averageLifespan: number | null;
  averageAgeOver16: number | null;
  oldestPerson: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    year?: number | null;
  } | null;
  mostChildren: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    count?: number | null;
  } | null;
  mostMarriages: {
    id: string;
    treeId: string;
    firstName: string;
    lastName: string;
    count?: number | null;
  } | null;
  centuryStats: Array<{ label: string; startYear: number; people: number; averageAge: number | null }>;
}
