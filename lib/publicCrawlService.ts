// Shared loader for public person crawl payloads (API + middleware).

import type { Person, Relationship } from '../types';
import { bucketPublicCrawlRelationships } from './publicCrawlRelations';
import { isPersonPubliclyCrawlable } from './publicCrawlPrivacy';
import { createServerSupabase } from './supabaseServer';

export interface PublicPersonCrawlPayload {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  person: {
    id: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    birthPlace?: string | null;
    deathPlace?: string | null;
    bio?: string | null;
    isPrivate?: boolean;
    isLiving?: boolean;
  };
  relationships: ReturnType<typeof bucketPublicCrawlRelationships>;
  updatedAt?: string | null;
}

const mapDbRelationship = (row: Record<string, unknown>): Relationship => ({
  id: String(row.id),
  treeId: String(row.tree_id ?? row.treeId),
  personId: String(row.person_id ?? row.personId),
  relatedId: String(row.related_id ?? row.relatedId),
  type: row.type as Relationship['type'],
  status: (row.status as Relationship['status']) ?? 'current',
  confidence: row.confidence as Relationship['confidence'],
});

export const loadPublicPersonCrawlPayload = async (
  personId: string,
  origin?: string
): Promise<PublicPersonCrawlPayload | null> => {
  const supabase = createServerSupabase();
  const { data: personRow, error: personError } = await supabase
    .from('persons')
    .select(
      'id, tree_id, first_name, last_name, title, birth_date_text, death_date_text, birth_place_text, death_place_text, bio, is_private, is_living, updated_at'
    )
    .eq('id', personId)
    .maybeSingle();
  if (personError || !personRow) return null;

  const { data: treeRow, error: treeError } = await supabase
    .from('family_trees')
    .select('id, name, slug, is_public')
    .eq('id', personRow.tree_id)
    .maybeSingle();
  if (treeError || !treeRow?.is_public) return null;

  const person = {
    id: personRow.id,
    firstName: personRow.first_name ?? '',
    lastName: personRow.last_name ?? '',
    title: personRow.title,
    birthDate: personRow.birth_date_text,
    deathDate: personRow.death_date_text,
    birthPlace: personRow.birth_place_text,
    deathPlace: personRow.death_place_text,
    bio: personRow.bio,
    isPrivate: personRow.is_private ?? false,
    isLiving: personRow.is_living ?? undefined,
  };
  if (!isPersonPubliclyCrawlable(person)) return null;

  const { data: connectionPayload, error: connectionError } = await supabase.rpc(
    'load_person_family_connections',
    {
      target_tree_id: personRow.tree_id,
      target_person_id: personId,
    }
  );
  if (connectionError) return null;

  const payload = (connectionPayload ?? {}) as Record<string, unknown>;
  const relationshipRows = Array.isArray(payload.relationships)
    ? payload.relationships
    : typeof payload.relationships === 'string'
      ? (JSON.parse(payload.relationships) as unknown[])
      : [];
  const peopleRows = Array.isArray(payload.people)
    ? payload.people
    : typeof payload.people === 'string'
      ? (JSON.parse(payload.people) as unknown[])
      : [];

  const relationships = relationshipRows.map((row) => mapDbRelationship(row as Record<string, unknown>));
  const people = peopleRows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        treeId: personRow.tree_id,
        firstName: String(record.first_name ?? record.firstName ?? ''),
        lastName: String(record.last_name ?? record.lastName ?? ''),
        title: record.title != null ? String(record.title) : undefined,
        gender: record.gender as Person['gender'] | undefined,
        isPrivate: Boolean(record.is_private ?? record.isPrivate),
        isLiving: record.is_living as boolean | undefined,
        birthDate: (record.birth_date_text ?? record.birthDate) as string | null | undefined,
        deathDate: (record.death_date_text ?? record.deathDate) as string | null | undefined,
        burialDate: (record.burial_date_text ?? record.burialDate) as string | null | undefined,
      };
    })
    .filter((row) => isPersonPubliclyCrawlable(row));

  const relationshipsFiltered = relationships.filter((rel) => {
    const endpointIds = [rel.personId, rel.relatedId];
    return endpointIds.every((id) => id === personId || people.some((person) => person.id === id));
  });

  return {
    treeId: personRow.tree_id,
    treeName: treeRow.name ?? 'Family tree',
    treeSlug: treeRow.slug,
    person,
    relationships: bucketPublicCrawlRelationships(
      personId,
      personRow.tree_id,
      relationshipsFiltered,
      people,
      origin
    ),
    updatedAt: personRow.updated_at,
  };
};

export interface PublicTreeCrawlPayload {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  description?: string | null;
  persons: { id: string; name: string; birthDate?: string | null; deathDate?: string | null }[];
  totalCount?: number;
}

export const loadPublicTreeCrawlPayload = async (
  treeId: string,
  rowOffset = 0,
  rowLimit = 500
): Promise<PublicTreeCrawlPayload | null> => {
  const supabase = createServerSupabase();
  const { data: treeRow, error: treeError } = await supabase
    .from('family_trees')
    .select('id, name, slug, description, is_public')
    .eq('id', treeId)
    .maybeSingle();
  if (treeError || !treeRow?.is_public) return null;

  const { data: rows, error: rowsError } = await supabase.rpc('list_public_tree_crawl_persons', {
    target_tree_id: treeId,
    row_limit: rowLimit,
    row_offset: rowOffset,
  });
  if (rowsError) return null;

  return {
    treeId: treeRow.id,
    treeName: treeRow.name ?? 'Family tree',
    treeSlug: treeRow.slug,
    description: treeRow.description,
    persons: (rows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.person_id ?? row.id),
      name: String(row.display_name ?? row.name ?? 'Unknown person'),
      birthDate: (row.birth_date_text as string | null) ?? null,
      deathDate: (row.death_date_text as string | null) ?? null,
    })),
  };
};
