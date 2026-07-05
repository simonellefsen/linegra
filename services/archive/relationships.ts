import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Citation, Note, PersonEvent, RelationshipConfidence, RelationshipStatus, Source } from '../../types';
import { mapDbPerson } from '../../lib/archiveDbMappers';
import { normalizeActor } from './shared';

export const listTreeSources = async (treeId: string): Promise<Source[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, abbreviation, type, url, repository, citation_date_text, call_number, notes')
    .eq('tree_id', treeId)
    .order('title', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id,
    externalId: row.id,
    title: row.title || 'Untitled Record',
    abbreviation: row.abbreviation || undefined,
    type: row.type || 'Unknown',
    url: row.url || undefined,
    repository: row.repository || undefined,
    citationDate: row.citation_date_text || undefined,
    callNumber: row.call_number || undefined,
    notes: row.notes || undefined
  }));
};

/**
 * Consolidate duplicate source rows into one canonical source. Citations on the merged rows are
 * repointed to the canonical (duplicate person+event citations collapsed), then the merged rows are
 * deleted. Delegates to the `admin_merge_sources` security-definer RPC.
 */
export const mergeSources = async (
  treeId: string,
  canonicalSourceId: string,
  sourceIds: string[],
  actor?: { id?: string | null; name?: string | null }
): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_merge_sources', {
    target_tree_id: treeId,
    payload_canonical_source_id: canonicalSourceId,
    payload_source_ids: sourceIds,
    payload_actor_id: normalizedActor.id,
    payload_actor_name: normalizedActor.name
  });
  if (error) throw new Error(error.message);
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

export const updateRelationshipDetails = async (
  relationshipId: string,
  payload: {
    dateText?: string | null;
    placeText?: string | null;
    status?: RelationshipStatus | null;
    notes?: string | null;
    unionType?: 'marriage' | 'partner' | null;
  },
  actor?: { id?: string | null; name?: string | null }
) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const { error } = await supabase.rpc('admin_update_relationship_details', {
    target_relationship_id: relationshipId,
    payload_date_text: payload.dateText ?? null,
    payload_place_text: payload.placeText ?? null,
    payload_status: payload.status ?? null,
    payload_notes: payload.notes ?? null,
    payload_union_type: payload.unionType ?? null,
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

  const { data, error } = await supabase.rpc('search_tree_persons', {
    target_tree_id: treeId,
    search_query: term,
    result_limit: limit,
    result_offset: offset,
    filter_living_only: options.filters?.livingOnly ?? false,
    filter_deceased_only: options.filters?.deceasedOnly ?? false,
    filter_missing_data: options.filters?.missingData ?? false,
    filter_gender: options.filters?.gender ?? null,
  });
  if (error) throw new Error(error.message);

  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as { total?: number; results?: unknown[] })
      : { total: 0, results: [] };
  const rows = Array.isArray(payload.results) ? payload.results : [];

  const emptyNotes: Record<string, Note[]> = {};
  const emptySources: Record<string, Source[]> = {};
  const emptyEvents: Record<string, PersonEvent[]> = {};
  const emptyCitations: Record<string, Citation[]> = {};

  return {
    total: Number(payload.total ?? rows.length),
    results: rows.map((row) =>
      mapDbPerson(row as Record<string, unknown>, emptyNotes, emptySources, emptyEvents, emptyCitations)
    ),
  };
};
