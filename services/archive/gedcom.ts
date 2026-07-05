import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { inferDefaultProbandId } from '../../lib/gedcomFidelity';
import { Person, Relationship } from '../../types';
import { asRelationshipMetadata, normalizePlace, toDbPerson } from '../../lib/archiveDbMappers';
import { chunkedInsert, normalizeActor, randomId, recordAuditLogs, type ImportActor } from './shared';
import { updateTreeSettings } from './trees';

export const importGedcomToSupabase = async (
  treeId: string,
  data: { people: Person[]; relationships: Relationship[] },
  actor?: ImportActor | null
): Promise<{ probandId: string | null }> => {
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
    const relationshipMetadata = asRelationshipMetadata(rel.metadata);
    const dateText = typeof rel.date === 'string' && rel.date.trim() ? rel.date : null;
    const placeText = normalizePlace(rel.place);
    if (dateText) relationshipMetadata.date_text = dateText;
    if (placeText) relationshipMetadata.place_text = placeText;
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
      metadata: relationshipMetadata
    };
  }).filter(Boolean);

  const events: any[] = [];
  const notes: any[] = [];
  const sources: any[] = [];
  const citations: any[] = [];
  const sourceExternalToDbId = new Map<string, string>();
  const sourceLocalToDbId = new Map<string, string>();
  if (personRows.length) {
    await chunkedInsert('persons', personRows);
  }

  if (relationshipRows.length) {
    await chunkedInsert('relationships', relationshipRows as any[]);
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
        quality: citation.quality || citation.extra?.quality || (citation.quay != null ? String(citation.quay) : null),
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

  await recordAuditLogs([
    {
      tree_id: treeId,
      actor_id: userId,
      actor_name: actorName,
      action: 'gedcom_import',
      entity_type: 'tree',
      entity_id: treeId,
      details: {
        source: 'GEDCOM',
        people: personRows.length,
        relationships: relationshipRows.length,
        events: events.length,
        sources: sources.length,
        citations: citations.length,
      },
    },
  ]);

  await supabase.from('gedcom_imports').insert({
    tree_id: treeId,
    uploaded_by: userId || null,
    file_name: `import-${Date.now()}.ged`,
    status: 'completed',
    stats: { people: personRows.length, relationships: relationshipRows.length }
  });

  const inferredProbandId = inferDefaultProbandId(data.people, data.relationships);
  const mappedProbandId = inferredProbandId ? personIdMap.get(inferredProbandId) ?? null : null;
  if (mappedProbandId) {
    await updateTreeSettings(treeId, { probandId: mappedProbandId }, actor);
  }

  console.info('[Linegra] GEDCOM import synced to Supabase', {
    treeId,
    people: personRows.length,
    relationships: relationshipRows.length,
    events: events.length,
    sources: sources.length,
    citations: citations.length,
    probandId: mappedProbandId,
  });

  return { probandId: mappedProbandId };
};


