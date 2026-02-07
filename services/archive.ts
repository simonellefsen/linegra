import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { FamilyTree as FamilyTreeType, FamilyTreeSummary, Person, Relationship, Source, Note, PersonEvent, Citation, FamilyLayoutState, FamilyLayoutAudit } from '../types';

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

const toDbPerson = (person: Person, treeId: string, userId?: string | null) => {
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
    birth_place_text: normalizePlace(person.birthPlace) || null,
    death_date_text: person.deathDate || null,
    death_place_text: normalizePlace(person.deathPlace) || null,
    burial_date_text: person.burialDate || null,
    burial_place_text: normalizePlace(person.burialPlace) || null,
    residence_at_death_text: normalizePlace(person.residenceAtDeath) || null,
    photo_url: person.photoUrl || null,
    bio: person.bio || null,
    occupations: person.occupations || [],
    is_dna_match: person.isDNAMatch || false,
    dna_match_info: person.dnaMatchInfo || null,
    tags: [],
    user_role: person.userRole || null,
    metadata: person.metadata ? person.metadata : {}
  };
};

const mapDbPerson = (
  row: any,
  notesByPerson: Record<string, Note[]>,
  sourcesByPerson: Record<string, Source[]>,
  eventsByPerson: Record<string, PersonEvent[]>,
  citationsByPerson: Record<string, Citation[]>
) : Person => {
  return {
    id: row.id,
    treeId: row.tree_id,
    firstName: row.first_name,
    lastName: row.last_name,
    maidenName: row.maiden_name || undefined,
    gender: row.gender || 'O',
    birthDate: row.birth_date_text || undefined,
    birthPlace: row.birth_place_text || undefined,
    deathDate: row.death_date_text || undefined,
    deathPlace: row.death_place_text || undefined,
    burialDate: row.burial_date_text || undefined,
    burialPlace: row.burial_place_text || undefined,
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
    metadata: row.metadata || undefined
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

export const loadArchiveData = async (treeId: string, search?: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  let personQuery = supabase.from('persons').select('*').eq('tree_id', treeId).order('last_name');
  if (search) {
    personQuery = personQuery.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,maiden_name.ilike.%${search}%`);
  }
  const { data: personRows, error } = await personQuery;
  if (error) throw new Error(error.message);
  const personIds = personRows.map((row) => row.id);
  const notesByPerson: Record<string, Note[]> = {};
  const sourcesByPerson: Record<string, Source[]> = {};
  const eventsByPerson: Record<string, PersonEvent[]> = {};
  const citationsByPerson: Record<string, Citation[]> = {};

  if (personIds.length > 0) {
    const { data: noteRows } = await supabase.from('notes').select('*').in('person_id', personIds);
    noteRows?.forEach((note) => {
      const list = notesByPerson[note.person_id] || (notesByPerson[note.person_id] = []);
      list.push({
        id: note.id,
        text: note.body,
        type: note.type,
        event: note.event_label || undefined,
        date: note.note_date_text || undefined
      });
    });

    const { data: eventRows } = await supabase.from('person_events').select('*').in('person_id', personIds);
    eventRows?.forEach((event) => {
      const list = eventsByPerson[event.person_id] || (eventsByPerson[event.person_id] = []);
      list.push({
        id: event.id,
        type: event.event_type,
        date: event.date_text || undefined,
        place: event.place_text || undefined,
        description: event.description || undefined,
        employer: event.employer || undefined
      });
    });

    const { data: sourceRows } = await supabase.from('sources').select('*').eq('tree_id', treeId);
    const sourceMap = new Map<string, any>();
    sourceRows?.forEach((row) => sourceMap.set(row.id, row));
    const { data: citationRows } = await supabase.from('citations').select('*').in('person_id', personIds);
    citationRows?.forEach((citation: any) => {
      const src = sourceMap.get(citation.source_id);
      if (!src) return;
      const extra = (citation as any)?.extra || {};
      const inlineNotes = extra.inline_notes as string | undefined;
      const citationEntry: Citation = {
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
      const citationList = citationsByPerson[citation.person_id] || (citationsByPerson[citation.person_id] = []);
      citationList.push(citationEntry);
      const combinedNotes = [inlineNotes, src.notes, citationEntry.dataText].filter(Boolean).join('\n\n') || undefined;
      const list = sourcesByPerson[citation.person_id] || (sourcesByPerson[citation.person_id] = []);
      list.push({
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
        notes: combinedNotes,
        event: citation.event_label || 'General'
      });
    });
  }

  const { data: relationshipRows, error: relError } = await supabase.from('relationships').select('*').eq('tree_id', treeId);
  if (relError) throw new Error(relError.message);

  const people = personRows.map((row) => mapDbPerson(row, notesByPerson, sourcesByPerson, eventsByPerson, citationsByPerson));
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
    const { error } = await supabase.from('persons').insert(personRows);
    if (error) throw new Error(error.message);
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
    const { error } = await supabase.from('relationships').insert(relationshipRows as any[]);
    if (error) throw new Error(error.message);
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
    const { error } = await supabase.from('person_events').insert(events);
    if (error) throw new Error(error.message);
  }
  if (notes.length) {
    const { error } = await supabase.from('notes').insert(notes);
    if (error) throw new Error(error.message);
  }
  if (sources.length) {
    const { error } = await supabase.from('sources').insert(sources);
    if (error) throw new Error(error.message);
  }
  if (citations.length) {
    const { error } = await supabase.from('citations').insert(citations);
    if (error) throw new Error(error.message);
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
