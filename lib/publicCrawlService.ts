// Shared loader for public person crawl payloads (API + middleware).

import type { Person, Relationship } from '../types';
import { bucketPublicCrawlRelationships } from './publicCrawlRelations';
import { isPersonPubliclyCrawlable } from './publicCrawlPrivacy';
import {
  childrenSharedByParents,
  matchUnionIdPrefix,
  relationshipDateFromRow,
  relationshipPlaceFromRow,
} from './publicCrawlUnions';
import { formatLifespanSuffix } from './publicSlugs';
import { formatPersonDisplayName } from './publicCrawlPrivacy';
import { buildFamilyUrl, buildPersonUrl } from './publicRoutes';
import { buildPublicCrawlSources, type PublicCrawlSourceRef } from './publicCrawlSources';
import { createServerSupabase } from './supabaseServer';
import type { PublicCrawlPersonRef } from './publicCrawlRelations';

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
  sources: PublicCrawlSourceRef[];
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
  date: relationshipDateFromRow(row),
  place: relationshipPlaceFromRow(row),
});

const loadPublicPersonSources = async (
  personId: string,
  treeId: string
): Promise<PublicCrawlSourceRef[]> => {
  const supabase = createServerSupabase();
  const { data: citationRows, error: citationError } = await supabase
    .from('citations')
    .select('source_id, event_label, label, page_text, data_date, data_text')
    .eq('person_id', personId)
    .eq('tree_id', treeId);
  if (citationError || !citationRows?.length) return [];

  const sourceIds = [...new Set(citationRows.map((row) => String(row.source_id)))];
  const { data: sourceRows, error: sourceError } = await supabase
    .from('sources')
    .select(
      'id, title, type, repository, url, citation_date_text, page, call_number, abbreviation, notes'
    )
    .eq('tree_id', treeId)
    .in('id', sourceIds);
  if (sourceError || !sourceRows?.length) return [];

  return buildPublicCrawlSources(
    sourceRows.map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      type: String(row.type ?? 'Unknown'),
      repository: row.repository,
      url: row.url,
      citation_date_text: row.citation_date_text,
      page: row.page,
      call_number: row.call_number,
      abbreviation: row.abbreviation,
      notes: row.notes,
    })),
    citationRows.map((row) => ({
      source_id: String(row.source_id),
      event_label: row.event_label,
      label: row.label,
      page_text: row.page_text,
      data_date: row.data_date,
      data_text: row.data_text,
    }))
  );
};

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

  const sources = await loadPublicPersonSources(personId, personRow.tree_id);

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
    sources,
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

export interface PublicFamilyCrawlPayload {
  treeId: string;
  treeName: string;
  treeSlug?: string | null;
  union: {
    id: string;
    type: 'marriage' | 'partner';
    date?: string | null;
    place?: string | null;
    familyPageHref: string;
  };
  spouses: Array<{
    id: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    href: string;
    name: string;
  }>;
  children: PublicCrawlPersonRef[];
}

const childRelationshipLabel = (gender?: Person['gender'] | null): string => {
  if (gender === 'M') return 'Son';
  if (gender === 'F') return 'Daughter';
  return 'Child';
};

const mapConnectionPeople = (
  peopleRows: unknown[],
  treeId: string
): Array<{
  id: string;
  treeId: string;
  firstName: string;
  lastName: string;
  title?: string;
  gender?: Person['gender'];
  isPrivate: boolean;
  isLiving?: boolean;
  birthDate?: string | null;
  deathDate?: string | null;
}> =>
  peopleRows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        treeId,
        firstName: String(record.first_name ?? record.firstName ?? ''),
        lastName: String(record.last_name ?? record.lastName ?? ''),
        title: record.title != null ? String(record.title) : undefined,
        gender: record.gender as Person['gender'] | undefined,
        isPrivate: Boolean(record.is_private ?? record.isPrivate),
        isLiving: record.is_living as boolean | undefined,
        birthDate: (record.birth_date_text ?? record.birthDate) as string | null | undefined,
        deathDate: (record.death_date_text ?? record.deathDate) as string | null | undefined,
      };
    })
    .filter((row) => isPersonPubliclyCrawlable(row));

const parseConnectionPayload = (
  connectionPayload: unknown,
  treeId: string
): { relationships: Relationship[]; people: ReturnType<typeof mapConnectionPeople> } => {
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
  return {
    relationships: relationshipRows.map((row) => mapDbRelationship(row as Record<string, unknown>)),
    people: mapConnectionPeople(peopleRows, treeId),
  };
};

export const resolvePublicUnionRelationshipId = async (
  treeId: string,
  unionIdPrefix: string
): Promise<string | null> => {
  const supabase = createServerSupabase();
  const { data: rows, error } = await supabase
    .from('relationships')
    .select('id, type')
    .eq('tree_id', treeId)
    .in('type', ['marriage', 'partner']);
  if (error || !rows?.length) return null;
  const match = rows.find((row) => matchUnionIdPrefix(String(row.id), unionIdPrefix));
  return match ? String(match.id) : null;
};

export const loadPublicFamilyCrawlPayload = async (
  unionRelationshipId: string,
  origin?: string
): Promise<PublicFamilyCrawlPayload | null> => {
  const supabase = createServerSupabase();
  const { data: unionRow, error: unionError } = await supabase
    .from('relationships')
    .select('id, tree_id, person_id, related_id, type, metadata')
    .eq('id', unionRelationshipId)
    .maybeSingle();
  if (unionError || !unionRow) return null;
  if (unionRow.type !== 'marriage' && unionRow.type !== 'partner') return null;

  const { data: treeRow, error: treeError } = await supabase
    .from('family_trees')
    .select('id, name, slug, is_public')
    .eq('id', unionRow.tree_id)
    .maybeSingle();
  if (treeError || !treeRow?.is_public) return null;

  const spouseIds = [String(unionRow.person_id), String(unionRow.related_id)];
  const { data: spouseRows, error: spouseError } = await supabase
    .from('persons')
    .select('id, first_name, last_name, title, birth_date_text, death_date_text, is_private, is_living')
    .eq('tree_id', unionRow.tree_id)
    .in('id', spouseIds);
  if (spouseError || !spouseRows?.length) return null;

  const crawlableSpouses = spouseRows
    .map((row) => ({
      id: row.id,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      title: row.title,
      birthDate: row.birth_date_text,
      deathDate: row.death_date_text,
      isPrivate: row.is_private ?? false,
      isLiving: row.is_living ?? undefined,
    }))
    .filter((person) => isPersonPubliclyCrawlable(person));
  if (!crawlableSpouses.length) return null;

  const anchorSpouseId = crawlableSpouses[0]!.id;
  const { data: connectionPayload, error: connectionError } = await supabase.rpc(
    'load_person_family_connections',
    {
      target_tree_id: unionRow.tree_id,
      target_person_id: anchorSpouseId,
    }
  );
  if (connectionError) return null;

  const connection = parseConnectionPayload(connectionPayload, unionRow.tree_id);

  const unionRelationship = mapDbRelationship(unionRow as Record<string, unknown>);
  const treeRef = { id: treeRow.id, slug: treeRow.slug };
  const sharedChildIds = childrenSharedByParents(spouseIds[0]!, spouseIds[1]!, connection.relationships);
  const peopleById = new Map(connection.people.map((person) => [person.id, person]));

  const children: PublicCrawlPersonRef[] = [];
  for (const childId of sharedChildIds) {
    const person = peopleById.get(childId);
    if (!person) continue;
    const name = `${formatPersonDisplayName(person)}${formatLifespanSuffix(person)}`;
    children.push({
      id: person.id,
      treeId: treeRow.id,
      name,
      href: buildPersonUrl(treeRef, person.id, origin),
      rel: 'child',
      relationshipType: 'child',
      relationshipLabel: childRelationshipLabel(person.gender),
    });
  }

  const spouses = crawlableSpouses.map((person) => ({
    ...person,
    name: `${formatPersonDisplayName(person)}${formatLifespanSuffix(person)}`,
    href: buildPersonUrl(treeRef, person.id, origin),
  }));

  return {
    treeId: treeRow.id,
    treeName: treeRow.name ?? 'Family tree',
    treeSlug: treeRow.slug,
    union: {
      id: unionRelationship.id,
      type: unionRelationship.type as 'marriage' | 'partner',
      date: unionRelationship.date ?? null,
      place:
        typeof unionRelationship.place === 'string'
          ? unionRelationship.place
          : unionRelationship.place?.fullText ?? null,
      familyPageHref: buildFamilyUrl(treeRef, unionRelationship.id, origin),
    },
    spouses,
    children,
  };
};
