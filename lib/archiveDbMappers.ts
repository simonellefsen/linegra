import { inferLivingStatus } from './lifespan';
import {
  Citation,
  DNATest,
  DNATestType,
  DNAVendor,
  FamilyTree as FamilyTreeType,
  Note,
  Person,
  PersonEvent,
  Relationship,
  Source,
  StructuredPlace,
  TreeCollaborator,
} from '../types';

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export const normalizePlace = (place?: string | { fullText?: string }) => {
  if (!place) return null;
  if (typeof place === 'string') return place;
  return place.fullText ?? null;
};

export const asRelationshipMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
};

const relationshipDateFromMetadata = (metadata: Record<string, unknown>): string | undefined => {
  const dateCandidate = metadata.date_text ?? metadata.relationship_date_text;
  return typeof dateCandidate === 'string' && dateCandidate.trim() ? dateCandidate : undefined;
};

const relationshipPlaceFromMetadata = (metadata: Record<string, unknown>): string | undefined => {
  const placeCandidate = metadata.place_text ?? metadata.relationship_place_text;
  return typeof placeCandidate === 'string' && placeCandidate.trim() ? placeCandidate : undefined;
};

export const mapDbRelationship = (row: any): Relationship => {
  const metadata = asRelationshipMetadata(row.metadata);
  return {
    id: row.id,
    treeId: row.tree_id,
    personId: row.person_id,
    relatedId: row.related_id,
    type: row.type,
    status: row.status || undefined,
    confidence: row.confidence || undefined,
    order: row.sort_order || undefined,
    date: relationshipDateFromMetadata(metadata),
    place: relationshipPlaceFromMetadata(metadata),
    notes: row.notes || undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
};

export const mapDbPerson = (
  row: any,
  notesByPerson: Record<string, Note[]>,
  sourcesByPerson: Record<string, Source[]>,
  eventsByPerson: Record<string, PersonEvent[]>,
  citationsByPerson: Record<string, Citation[]>
): Person => {
  const metadata = row.metadata || {};
  const structuredBirth = metadata.structured_birth_place;
  const structuredDeath = metadata.structured_death_place;
  const structuredBurial = metadata.structured_burial_place;
  const structuredResidence = metadata.structured_residence_at_death;
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
    deathCause: row.death_cause || undefined,
    normalizedDeathCause:
      typeof metadata.normalized_death_cause === 'string' ? metadata.normalized_death_cause : undefined,
    deathCauseCategory: row.death_cause_category || undefined,
    residenceAtDeath: structuredResidence || row.residence_at_death_text || undefined,
    photoUrl: row.photo_url || undefined,
    bio: row.bio || undefined,
    occupations: row.occupations || [],
    generation: row.generation || undefined,
    updatedAt: row.updated_at,
    isLiving: inferLivingStatus({
      birthDate: row.birth_date_text || undefined,
      deathDate: row.death_date_text || undefined,
      burialDate: row.burial_date_text || undefined,
      isLiving: row.is_living === null ? undefined : (row.is_living ?? undefined),
    }),
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
    metadata,
  } as Person;
};

export const mapDbTree = (row: any): FamilyTreeType => {
  const metadata = row.metadata || undefined;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    description: row.description,
    ownerId: row.owner_id ?? null,
    isPublic: !!row.is_public,
    themeColor: row.theme_color ?? undefined,
    metadata,
    defaultProbandId: metadata?.defaultProbandId ?? null,
    defaultProbandLabel: metadata?.defaultProbandLabel ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastModified: row.updated_at,
  };
};

export const mapBasicPeople = (rows: any[] = []) => {
  const noteMap: Record<string, Note[]> = {};
  const sourceMap: Record<string, Source[]> = {};
  const eventMap: Record<string, PersonEvent[]> = {};
  const citationMap: Record<string, Citation[]> = {};
  return rows.map((row) => mapDbPerson(row, noteMap, sourceMap, eventMap, citationMap));
};

const legacyHaplogroupTarget = (
  legacy: string | undefined,
  testType: string
): { y?: string; mt?: string } => {
  if (!legacy) return {};
  if (testType === 'Y-DNA') return { y: legacy };
  if (testType === 'mtDNA') return { mt: legacy };
  if (/^[A-Z]-/.test(legacy)) return { y: legacy };
  return { mt: legacy };
};

export const mapDbDnaTest = (row: any): DNATest => {
  const metadata = (row.metadata || {}) as Record<string, any>;
  const sharedPersonId =
    typeof row.shared_person_id === 'string'
      ? row.shared_person_id
      : metadata.sharedPersonId || metadata.shared_person_id || undefined;
  const sharedMatchPersonId =
    typeof row.shared_match_person_id === 'string'
      ? row.shared_match_person_id
      : metadata.sharedMatchPersonId || metadata.shared_match_person_id || undefined;
  const legacyHaplogroup =
    (typeof row.haplogroup === 'string' && row.haplogroup) ||
    (typeof metadata.haplogroup === 'string' && metadata.haplogroup) ||
    undefined;
  const legacyTarget = legacyHaplogroupTarget(legacyHaplogroup, row.test_type);
  return {
    id: row.id,
    type: row.test_type as DNATestType,
    vendor: row.vendor as DNAVendor,
    testDate: row.test_date || metadata.testDate || undefined,
    matchDate: row.match_date || metadata.matchDate || undefined,
    isPrivate: !!row.is_private,
    yHaplogroup: metadata.yHaplogroup || legacyTarget.y || undefined,
    mtDnaHaplogroup: metadata.mtDnaHaplogroup || legacyTarget.mt || undefined,
    mitotree: metadata.mitotree || undefined,
    notes: row.notes || undefined,
    consentGivenAt: row.consent_given_at || undefined,
    consentScope: row.consent_scope || undefined,
    encryptedRawPayload:
      typeof metadata.encryptedRawPayload === 'string' ? metadata.encryptedRawPayload : undefined,
    rawMarkerIndexStats: metadata.rawMarkerIndexStats || undefined,
    hasEncryptedRaw: typeof metadata.encryptedRawPayload === 'string',
    testNumber: metadata.testNumber || undefined,
    isConfirmed: typeof metadata.isConfirmed === 'boolean' ? metadata.isConfirmed : undefined,
    hvr1: metadata.hvr1 || undefined,
    hvr2: metadata.hvr2 || undefined,
    extraMutations: metadata.extraMutations || undefined,
    codingRegion: metadata.codingRegion || undefined,
    mostDistantAncestorId: metadata.mostDistantAncestorId || undefined,
    rawDataSummary: metadata.rawDataSummary || undefined,
    rawDataPreview: metadata.encryptedRawPayload ? undefined : metadata.rawDataPreview || undefined,
    sharedPersonId,
    sharedMatchName: metadata.sharedMatchName || undefined,
    sharedMatchPersonId,
    sharedSegmentSummary: metadata.sharedSegmentSummary || undefined,
    sharedSegmentsPreview: metadata.sharedSegmentsPreview || undefined,
    sharedPathPersonIds: metadata.sharedPathPersonIds || undefined,
    sharedPathRelationshipIds: metadata.sharedPathRelationshipIds || undefined,
  };
};

export const mapDbCollaborator = (row: any): TreeCollaborator => ({
  id: row.id,
  treeId: row.tree_id ?? row.treeId,
  profileId: row.profile_id ?? row.profileId ?? null,
  invitationEmail: row.invitation_email ?? row.invitationEmail ?? null,
  role: row.role,
  status: row.status,
  displayName: row.display_name ?? row.displayName ?? null,
  email: row.email ?? null,
  invitedAt: row.invited_at ?? row.invitedAt,
  respondedAt: row.responded_at ?? row.respondedAt ?? null,
});

export const toDbPerson = (person: Person, treeId: string, userId?: string | null) => {
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
    metadata,
  };
};
