import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { FamilyTree as FamilyTreeType, Person, Relationship, Source, Note, PersonEvent } from '../types';
import { MOCK_TREES } from '../mockData';

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

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
    residence_at_death_text: normalizePlace(person.residenceAtDeath) || null,
    photo_url: person.photoUrl || null,
    bio: person.bio || null,
    occupations: person.occupations || [],
    is_dna_match: person.isDNAMatch || false,
    dna_match_info: person.dnaMatchInfo || null,
    tags: [],
    user_role: person.userRole || null,
    added_by_user_id: person.addedByUserId || null
  };
};

const mapDbPerson = (row: any, notesByPerson: Record<string, Note[]>, sourcesByPerson: Record<string, Source[]>, eventsByPerson: Record<string, PersonEvent[]>) : Person => {
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
    events: eventsByPerson[row.id] || [],
    mediaIds: []
  } as Person;
};

export const ensureTrees = async (): Promise<FamilyTreeType[]> => {
  if (!isSupabaseConfigured()) {
    return MOCK_TREES;
  }
  const { data, error } = await supabase.from('family_trees').select('*').order('created_at');
  if (error) throw new Error(error.message);
  if (data.length === 0) {
    const defaultTree = {
      name: 'Linegra Family Archive',
      description: 'Default archive created automatically',
      owner_id: null,
      is_public: false,
      theme_color: '#0f172a'
    };
    const { data: created, error: insertError } = await supabase.from('family_trees').insert(defaultTree).select('*');
    if (insertError) throw new Error(insertError.message);
    return created as FamilyTreeType[];
  }
  return data as FamilyTreeType[];
};

export const loadArchiveData = async (treeId: string, search?: string) => {
  if (!isSupabaseConfigured()) {
    return {
      people: [],
      relationships: []
    };
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
    citationRows?.forEach((citation) => {
      const src = sourceMap.get(citation.source_id);
      if (!src) return;
      const list = sourcesByPerson[citation.person_id] || (sourcesByPerson[citation.person_id] = []);
      list.push({
        id: src.id,
        title: src.title,
        type: src.type,
        repository: src.repository || undefined,
        url: src.url || undefined,
        citationDate: src.citation_date_text || undefined,
        page: src.page || undefined,
        reliability: src.reliability || undefined,
        actualText: src.actual_text || undefined,
        notes: src.notes || undefined,
        event: citation.event_label || 'General'
      });
    });
  }

  const { data: relationshipRows, error: relError } = await supabase.from('relationships').select('*').eq('tree_id', treeId);
  if (relError) throw new Error(relError.message);

  const people = personRows.map((row) => mapDbPerson(row, notesByPerson, sourcesByPerson, eventsByPerson));
  const relationships = (relationshipRows || []).map((row) => ({
    id: row.id,
    treeId: row.tree_id,
    personId: row.person_id,
    relatedId: row.related_id,
    type: row.type,
    status: row.status || undefined,
    confidence: row.confidence || undefined,
    order: row.sort_order || undefined,
    notes: row.notes || undefined
  }));

  return { people, relationships };
};

export const importGedcomToSupabase = async (treeId: string, data: { people: Person[]; relationships: Relationship[] }, userId?: string | null) => {
  if (!isSupabaseConfigured()) return;
  const personIdMap = new Map<string, string>();
  const personRows = data.people.map((person) => {
    const row = toDbPerson(person, treeId, userId);
    personIdMap.set(person.id, row.id);
    return row;
  });
  if (personRows.length) {
    const { error } = await supabase.from('persons').insert(personRows);
    if (error) throw new Error(error.message);
  }

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
      sort_order: rel.order || null
    };
  }).filter(Boolean);

  if (relationshipRows.length) {
    const { error } = await supabase.from('relationships').insert(relationshipRows as any[]);
    if (error) throw new Error(error.message);
  }

  const events: any[] = [];
  const notes: any[] = [];
  const sources: any[] = [];
  const citations: any[] = [];

  data.people.forEach((person) => {
    const personId = personIdMap.get(person.id);
    if (!personId) return;
    (person.events || []).forEach((event) => {
      if (['Birth', 'Death', 'Burial'].includes(event.type)) return;
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
    (person.sources || []).forEach((source) => {
      const sourceId = randomId();
      sources.push({
        id: sourceId,
        tree_id: treeId,
        title: source.title || 'Untitled Record',
        type: source.type || 'Unknown',
        repository: source.repository || null,
        url: source.url || null,
        citation_date_text: source.citationDate || null,
        page: source.page || null,
        reliability: source.reliability || null,
        actual_text: source.actualText || null,
        notes: source.notes || null
      });
      citations.push({
        id: randomId(),
        tree_id: treeId,
        source_id: sourceId,
        person_id: personId,
        event_label: source.event || 'General',
        label: source.event || 'General'
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

  await supabase.from('gedcom_imports').insert({
    tree_id: treeId,
    uploaded_by: userId || null,
    file_name: `import-${Date.now()}.ged`,
    status: 'completed',
    stats: { people: personRows.length, relationships: relationshipRows.length }
  });
};
