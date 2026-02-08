import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { FamilyTree as FamilyTreeType, FamilyTreeSummary, Person, Relationship, Source, Note, PersonEvent, Citation, FamilyLayoutState, FamilyLayoutAudit, StructuredPlace } from '../types';

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
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id ?? null,
    isPublic: !!row.is_public,
    themeColor: row.theme_color ?? undefined,
    metadata: row.metadata || undefined,
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
        'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, updated_at, metadata'
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata'
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata'
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata'
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, bio, updated_at, metadata'
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, photo_url, metadata, updated_at'
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
}

export const updatePersonProfile = async (
  personId: string,
  payload: UpdatePersonProfilePayload
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_update_person_profile', {
    target_person_id: personId,
    payload_actor_id: payload.actorId ?? null,
    payload_actor_name: payload.actorName ?? null,
    payload_profile: payload.profile,
    payload_events: payload.events ?? [],
    payload_notes: payload.notes ?? []
  });
  if (error) throw new Error(error.message);
  return data;
};

export const searchPersonsInTree = async (
  treeId: string,
  term: string,
  options: {
    limit?: number;
    offset?: number;
    filters?: { livingOnly?: boolean; missingData?: boolean };
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
      'id, tree_id, first_name, last_name, maiden_name, gender, birth_date_text, death_date_text, birth_place_text, death_place_text, burial_date_text, burial_place_text, residence_at_death_text, metadata, bio, occupations, updated_at, created_by, is_dna_match, dna_match_info',
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
    query = query.is('death_date_text', null);
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

  const [noteRows, eventRows, citationRows] = await Promise.all([
    supabase.from('notes').select('*').eq('person_id', personId),
    supabase.from('person_events').select('*').eq('person_id', personId),
    supabase.from('citations').select('*').eq('person_id', personId)
  ]);

  if (noteRows.error) throw new Error(noteRows.error.message);
  if (eventRows.error) throw new Error(eventRows.error.message);
  if (citationRows.error) throw new Error(citationRows.error.message);

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
  return { ...person, detailsLoaded: true };
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
