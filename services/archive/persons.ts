import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { assessArchiveLoad, DEFAULT_PEDIGREE_ANCESTOR_DEPTH, DEFAULT_PEDIGREE_DESCENDANT_DEPTH, LANDING_BIRTHDAY_SCAN_LIMIT } from '../../lib/treePerformance';
import { parseQuay } from '../../lib/sourceQuality';
import { Citation, DNATest, Note, Person, PersonEvent, Relationship, Source, StructuredPlace } from '../../types';
import { mapBasicPeople, mapDbDnaTest, mapDbPerson, mapDbRelationship } from '../../lib/archiveDbMappers';
import { fetchArchiveRpcPages, normalizeActor, parseRpcJsonPage, UUID_REGEX } from './shared';
import { scoreNameMatch } from '../../lib/dnaNameMatch';
import {
  buildDnaMatchPayload,
  buildFullName,
  fetchPersonSummaryRowsByIds,
  resolvePersonIdByName,
  type DnaMatchPayloadItem,
  type NameLookupRow,
} from './dna';

export const loadArchiveData = async (treeId: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  // SECURITY DEFINER RPC pages avoid per-row RLS on large relationship scans (10k+ trees).
  const personRows = await fetchArchiveRpcPages('load_tree_archive_persons_page', treeId);
  const relationshipRows = await fetchArchiveRpcPages('load_tree_archive_relationships_page', treeId);

  const emptyNotes: Record<string, Note[]> = {};
  const emptySources: Record<string, Source[]> = {};
  const emptyEvents: Record<string, PersonEvent[]> = {};
  const emptyCitations: Record<string, Citation[]> = {};

  const people = personRows.map((row) => ({
    ...mapDbPerson(row, emptyNotes, emptySources, emptyEvents, emptyCitations),
    detailsLoaded: false
  }));
  const relationships = (relationshipRows || []).map(mapDbRelationship);

  const assessment = assessArchiveLoad(people.length, relationships.length);
  if (assessment.exceedsWarnThreshold && typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn(`[treePerformance] ${assessment.message}`);
  }

  return { people, relationships };
};

export interface PedigreeScopeArchive {
  focusPersonId: string | null;
  people: Person[];
  relationships: Relationship[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

export const loadPedigreeScope = async (
  treeId: string,
  focusPersonId: string | null,
  maxAncestorDepth = DEFAULT_PEDIGREE_ANCESTOR_DEPTH,
  maxDescendantDepth = DEFAULT_PEDIGREE_DESCENDANT_DEPTH
): Promise<PedigreeScopeArchive> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('load_pedigree_scope', {
    target_tree_id: treeId,
    focus_person_id: focusPersonId,
    max_ancestor_depth: maxAncestorDepth,
    max_descendant_depth: maxDescendantDepth,
  });
  if (error) throw new Error(error.message);
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const personRows = parseRpcJsonPage(payload.persons);
  const relationshipRows = parseRpcJsonPage(payload.relationships);
  return {
    focusPersonId: typeof payload.focus_person_id === 'string' ? payload.focus_person_id : null,
    people: mapBasicPeople(personRows).map((person) => ({ ...person, detailsLoaded: false })),
    relationships: relationshipRows.map(mapDbRelationship),
    hasMoreAncestors: payload.has_more_ancestors === true,
    hasMoreDescendants: payload.has_more_descendants === true,
  };
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
    .limit(LANDING_BIRTHDAY_SCAN_LIMIT);
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

  const { data, error } = await supabase.rpc('load_person_family_connections', {
    target_tree_id: treeId,
    target_person_id: personId,
  });
  if (error) {
    // Fallback for databases that have not applied the migration yet.
    if (!error.message.includes('load_person_family_connections')) {
      throw new Error(error.message);
    }
    return fetchPersonConnectionsLegacy(treeId, personId);
  }

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const relationshipRows = parseRpcJsonPage(payload.relationships);
  const peopleRows = parseRpcJsonPage(payload.people);
  return {
    relationships: relationshipRows.map(mapDbRelationship),
    people: mapBasicPeople(peopleRows),
  };
};

const fetchPersonConnectionsLegacy = async (
  treeId: string,
  personId: string
): Promise<{ relationships: Relationship[]; people: Person[] }> => {
  const { data: relationshipRows, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('tree_id', treeId)
    .or(`person_id.eq.${personId},related_id.eq.${personId}`);

  if (error) throw new Error(error.message);

  const parentTypes = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian', 'child'];
  const spouseIds = new Set<string>();
  const sharedChildIds = new Set<string>();
  const parentIds = new Set<string>();

  (relationshipRows || []).forEach((row) => {
    if (row.type === 'marriage' || row.type === 'partner') {
      const otherId = row.person_id === personId ? row.related_id : row.person_id;
      if (otherId) spouseIds.add(otherId);
    }
    if (parentTypes.includes(row.type) && row.related_id === personId && row.person_id) {
      parentIds.add(row.person_id);
    }
    if (parentTypes.includes(row.type) && row.person_id === personId && row.related_id) {
      sharedChildIds.add(row.related_id);
    }
  });

  if (sharedChildIds.size) {
    const { data: coparentRows, error: coparentError } = await supabase
      .from('relationships')
      .select('*')
      .eq('tree_id', treeId)
      .in('related_id', Array.from(sharedChildIds))
      .in('type', parentTypes)
      .neq('person_id', personId);
    if (coparentError) throw new Error(coparentError.message);
    coparentRows?.forEach((row) => {
      if (!relationshipRows?.some((existing) => existing.id === row.id)) {
        relationshipRows?.push(row);
      }
    });
  }

  if (spouseIds.size) {
    const { data: spouseChildRows, error: spouseChildError } = await supabase
      .from('relationships')
      .select('*')
      .eq('tree_id', treeId)
      .in('person_id', Array.from(spouseIds))
      .in('type', parentTypes);
    if (spouseChildError) throw new Error(spouseChildError.message);
    spouseChildRows?.forEach((row) => {
      if (!relationshipRows?.some((existing) => existing.id === row.id)) {
        relationshipRows?.push(row);
      }
    });
  }

  if (parentIds.size) {
    const { data: siblingRows, error: siblingError } = await supabase
      .from('relationships')
      .select('*')
      .eq('tree_id', treeId)
      .in('person_id', Array.from(parentIds))
      .in('type', parentTypes);
    if (siblingError) throw new Error(siblingError.message);
    siblingRows?.forEach((row) => {
      if (!relationshipRows?.some((existing) => existing.id === row.id)) {
        relationshipRows?.push(row);
      }
    });
  }

  const relationships = (relationshipRows || []).map(mapDbRelationship);

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

  const peopleRows = await fetchPersonSummaryRowsByIds(relatedIds);

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
  citations?: any[];
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
    payload_sources: payload.sources ?? [],
    payload_citations: payload.citations ?? []
  });
  if (error) throw new Error(error.message);

  let dnaMatchesPayload: DnaMatchPayloadItem[] = [];
  let nameRows: NameLookupRow[] = [];
  let focusFullName = '';
  let focusMaidenFullName = '';
  let uniqueAutosomalTesterId: string | null = null;
  const looksLikeFocusName = (name: string | null | undefined) => {
    const raw = typeof name === 'string' ? name : '';
    if (!raw) return false;
    const candidates = [focusFullName, focusMaidenFullName].filter(Boolean);
    return candidates.some((candidate) => scoreNameMatch(candidate, raw) >= 60);
  };
  if (payload.dnaTests?.length) {
    const { data: targetPersonRow, error: targetPersonError } = await supabase
      .from('persons')
      .select('id, tree_id, first_name, last_name, maiden_name')
      .eq('id', personId)
      .maybeSingle();
    if (targetPersonError) throw new Error(targetPersonError.message);
    if (targetPersonRow?.tree_id) {
      focusFullName = buildFullName(targetPersonRow.first_name, targetPersonRow.last_name);
      focusMaidenFullName = buildFullName(targetPersonRow.first_name, targetPersonRow.maiden_name);
      const { data: peopleNameRows, error: peopleNameError } = await supabase
        .from('persons')
        .select('id, first_name, last_name, maiden_name')
        .eq('tree_id', targetPersonRow.tree_id);
      if (peopleNameError) throw new Error(peopleNameError.message);
      nameRows = (peopleNameRows || []) as NameLookupRow[];

      const { data: autosomalRows, error: autosomalError } = await supabase
        .from('dna_tests')
        .select('person_id')
        .eq('test_type', 'Autosomal');
      if (autosomalError) throw new Error(autosomalError.message);
      const autosomalOwners = new Set<string>();
      (autosomalRows || []).forEach((row: any) => {
        const ownerId = typeof row?.person_id === 'string' ? row.person_id : '';
        if (!ownerId) return;
        if (!nameRows.some((candidate) => candidate.id === ownerId)) return;
        autosomalOwners.add(ownerId);
      });
      if (autosomalOwners.size === 1) {
        uniqueAutosomalTesterId = Array.from(autosomalOwners)[0];
      }
    }
  }
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
    const summary = test.sharedSegmentSummary;
    const summaryPersonLooksLikeFocus = !!summary && looksLikeFocusName(summary.personName);
    const summaryMatchLooksLikeFocus = !!summary && looksLikeFocusName(summary.matchName);
    const summaryPersonId = summaryPersonLooksLikeFocus
      ? personId
      : summary
      ? resolvePersonIdByName(summary.personName, nameRows)
      : null;
    const summaryMatchId = summaryMatchLooksLikeFocus
      ? personId
      : summary
      ? resolvePersonIdByName(summary.matchName, nameRows)
      : null;
    let sharedPersonId =
      (test.sharedPersonId && UUID_REGEX.test(test.sharedPersonId) ? test.sharedPersonId : null) ||
      summaryPersonId ||
      (summaryPersonLooksLikeFocus ? personId : null);
    let sharedMatchPersonId =
      lineage?.matchedPersonId ||
      (test.sharedMatchPersonId && UUID_REGEX.test(test.sharedMatchPersonId) ? test.sharedMatchPersonId : null) ||
      summaryMatchId ||
      (summaryMatchLooksLikeFocus ? personId : null);
    if (sharedPersonId && sharedMatchPersonId && sharedPersonId === sharedMatchPersonId) {
      if (summaryPersonLooksLikeFocus && summaryMatchId && summaryMatchId !== personId) {
        sharedPersonId = personId;
        sharedMatchPersonId = summaryMatchId;
      } else if (summaryMatchLooksLikeFocus && summaryPersonId && summaryPersonId !== personId) {
        sharedPersonId = summaryPersonId;
        sharedMatchPersonId = personId;
      }
    }
    if (!sharedPersonId && sharedMatchPersonId === personId && uniqueAutosomalTesterId && uniqueAutosomalTesterId !== personId) {
      // FTDNA comparison CSV omits tester name; when exactly one autosomal tester exists
      // in this tree, bind that tester as the shared-person side.
      sharedPersonId = uniqueAutosomalTesterId;
    }
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
    rawDataPreview: test.encryptedRawPayload ? null : test.rawDataPreview || null,
    sharedPersonId,
    sharedMatchName: test.sharedMatchName || null,
    sharedMatchPersonId,
    sharedSegmentSummary: test.sharedSegmentSummary || null,
    sharedSegmentsPreview: test.sharedSegmentsPreview || null,
    sharedPathPersonIds,
    sharedPathRelationshipIds,
    yHaplogroup: test.yHaplogroup || null,
    mtDnaHaplogroup: test.mtDnaHaplogroup || null,
    mitotree: test.mitotree || null,
    consentGivenAt: test.consentGivenAt || null,
    consentScope: test.consentScope || null,
    isPrivate: !!test.isPrivate || test.consentScope === 'raw_autosomal_storage' || !!test.encryptedRawPayload,
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
      rawDataPreview: test.encryptedRawPayload ? null : test.rawDataPreview || null,
      encryptedRawPayload: test.encryptedRawPayload || null,
      rawMarkerIndexStats: test.rawMarkerIndexStats || null,
      sharedPersonId,
      sharedMatchName: test.sharedMatchName || null,
      sharedMatchPersonId,
      sharedSegmentSummary: test.sharedSegmentSummary || null,
      sharedSegmentsPreview: test.sharedSegmentsPreview || null,
      sharedPathPersonIds,
      sharedPathRelationshipIds,
      yHaplogroup: test.yHaplogroup || null,
      mtDnaHaplogroup: test.mtDnaHaplogroup || null,
      mitotree: test.mitotree || null
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

  const sharedIdRows = dnaTestsPayload.filter(
    (test) =>
      test.type === 'Shared Autosomal' &&
      typeof test.id === 'string' &&
      UUID_REGEX.test(test.id) &&
      ((typeof test.sharedPersonId === 'string' && UUID_REGEX.test(test.sharedPersonId)) ||
        (typeof test.sharedMatchPersonId === 'string' && UUID_REGEX.test(test.sharedMatchPersonId)))
  );
  for (const test of sharedIdRows) {
    const { error: sharedIdError } = await supabase
      .from('dna_tests')
      .update({
        shared_person_id:
          typeof test.sharedPersonId === 'string' && UUID_REGEX.test(test.sharedPersonId)
            ? test.sharedPersonId
            : null,
        shared_match_person_id:
          typeof test.sharedMatchPersonId === 'string' && UUID_REGEX.test(test.sharedMatchPersonId)
            ? test.sharedMatchPersonId
            : null,
      })
      .eq('id', test.id)
      .eq('person_id', personId);
    if (sharedIdError) throw new Error(sharedIdError.message);
  }
  return data;
};

/**
 * All source documents in a tree (the tree-wide source library). RLS `can_read_tree` gates visibility.
 * Used by the source picker when citing an existing source for an additional event/person.
 */

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
    eventMap[personId] = eventRows.data.map((event) => {
      const eventMeta =
        event.metadata && typeof event.metadata === 'object'
          ? (event.metadata as Record<string, unknown>)
          : {};
      return {
        id: event.id,
        type: event.event_type,
        date: event.date_text || undefined,
        place: (eventMeta.structured_place as StructuredPlace | undefined) || event.place_text || undefined,
        description: event.description || undefined,
        employer: event.employer || undefined,
        metadata: Object.keys(eventMeta).length ? eventMeta : undefined
      };
    });
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
    const pushedSources = new Set<string>();
    citationList.forEach((citation: any) => {
      const src = sourceLookup.get(citation.source_id);
      if (!src) return;
      const extra = (citation as any)?.extra || {};
      const entry: Citation = {
        id: citation.id,
        sourceId: citation.source_id,
        eventLabel: citation.event_label || undefined,
        label: citation.label || undefined,
        page: citation.page_text || src.page || undefined,
        dataDate: citation.data_date || extra.data_date || undefined,
        dataText: citation.data_text || extra.data_text || undefined,
        quality: citation.quality || extra.quality || undefined,
        quay: parseQuay(citation.quality || extra.quality) ?? undefined,
        extra
      };
      citationMap[personId]!.push(entry);
      // One source card per underlying source row (deduped), so a source cited for multiple events
      // (e.g. a single dødsannonce for both death and burial) appears once with its citations listed
      // beneath rather than as duplicate cards.
      if (!pushedSources.has(src.id)) {
        pushedSources.add(src.id);
        sourceMap[personId]!.push({
          id: src.id,
          externalId: src.id,
          title: src.title,
          type: src.type,
          repository: src.repository || undefined,
          url: src.url || undefined,
          citationDate: src.citation_date_text || undefined,
          page: src.page || undefined,
          reliability: src.reliability || undefined,
          actualText: src.actual_text || undefined,
          abbreviation: src.abbreviation || undefined,
          callNumber: src.call_number || undefined,
          notes: src.notes || undefined
        });
      }
    });
  }

  const person = mapDbPerson(personRow, noteMap, sourceMap, eventMap, citationMap);
  return {
    ...person,
    dnaTests: (dnaRows.data || []).map(mapDbDnaTest),
    detailsLoaded: true
  };
};