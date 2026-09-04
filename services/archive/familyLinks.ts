import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { inferParentPairsForUnion, inferParentRelationshipType, isSpuriousCoparentParentLink, shouldSkipCoparentChildLink } from '../../lib/parentChildLinks';
import { inferSpouseDefaultGender } from '../../lib/personGender';
import { parentPlaceholderDefaults } from '../../lib/placeholderProfileDefaults';
import { Person, RelationshipType, FamilyLayoutState } from '../../types';
import { mapDbPerson } from '../../lib/archiveDbMappers';
import { normalizeActor, randomId, type ImportActor } from './shared';

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
  const { data: childRow, error: childError } = await supabase
    .from('persons')
    .select('birth_date_text, death_date_text, burial_date_text, is_living, is_private')
    .eq('id', childId)
    .eq('tree_id', treeId)
    .maybeSingle();
  if (childError) throw new Error(childError.message);
  if (!childRow) throw new Error('The child record could not be found in this tree.');
  const visibility = parentPlaceholderDefaults({
    birthDate: childRow.birth_date_text ?? undefined,
    deathDate: childRow.death_date_text ?? undefined,
    burialDate: childRow.burial_date_text ?? undefined,
    isLiving: childRow.is_living ?? undefined,
    isPrivate: Boolean(childRow.is_private),
  });
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
      is_private: visibility.isPrivate,
      is_dna_match: false,
      dna_match_info: null,
      is_living: visibility.isLiving,
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

  await insertParentChildLink({
    treeId,
    parentId: parentRow.id,
    childId,
    parentGender: defaultGender,
    metadata: {
      createdVia: 'manual_parent_button',
      createdBy: normalizedActor.name,
    },
  });

  return mapDbPerson(parentRow, {}, {}, {}, {});
};

export interface CreatedFamilyLink {
  person: Person;
  relationshipId: string;
}

const insertPlaceholderPerson = async (
  treeId: string,
  actor: ImportActor,
  metadata: Record<string, unknown>,
  gender: 'M' | 'F' | null = null
) => {
  const personId = randomId();
  const { data: personRow, error: personError } = await supabase
    .from('persons')
    .insert({
      id: personId,
      tree_id: treeId,
      first_name: '',
      last_name: '',
      maiden_name: null,
      gender: gender ?? 'O',
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
      created_by: actor.id,
      is_private: false,
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
  if (personError) throw new Error(personError.message);
  return personRow;
};

export const createPlaceholderSpouse = async ({
  treeId,
  personId,
  unionType = 'marriage',
  actor,
}: {
  treeId: string;
  personId: string;
  unionType?: 'marriage' | 'partner';
  actor?: ImportActor | null;
}): Promise<CreatedFamilyLink> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const focusGender = await fetchPersonGender(personId);
  const spouseGender = inferSpouseDefaultGender(focusGender);
  const spouseRow = await insertPlaceholderPerson(
    treeId,
    normalizedActor,
    {
      createdVia: 'manual_spouse_button',
    },
    spouseGender
  );
  const relationshipId = randomId();
  const { error: relError } = await supabase.from('relationships').insert({
    id: relationshipId,
    tree_id: treeId,
    person_id: personId,
    related_id: spouseRow.id,
    type: unionType,
    status: 'current',
    confidence: 'Unknown',
    metadata: { createdVia: 'manual_spouse_button' },
  } as any);
  if (relError) throw new Error(relError.message);
  return {
    person: mapDbPerson(spouseRow, {}, {}, {}, {}),
    relationshipId,
  };
};

export const createPlaceholderChild = async ({
  treeId,
  parentId,
  coparentId,
  actor,
}: {
  treeId: string;
  parentId: string;
  coparentId?: string | null;
  actor?: ImportActor | null;
}): Promise<CreatedFamilyLink> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const childRow = await insertPlaceholderPerson(treeId, normalizedActor, {
    createdVia: 'manual_child_button',
  });
  const parentGender = await fetchPersonGender(parentId);
  const relationshipId = await insertParentChildLink({
    treeId,
    parentId,
    childId: childRow.id,
    parentGender,
    metadata: { createdVia: 'manual_child_button' },
  });
  await linkCoparentChildIfNeeded({
    treeId,
    parentId,
    coparentId: coparentId && coparentId !== parentId ? coparentId : null,
    childId: childRow.id,
    actorName: normalizedActor.name,
    createdVia: 'manual_child_button_coparent',
  });
  return {
    person: mapDbPerson(childRow, {}, {}, {}, {}),
    relationshipId,
  };
};

/** Add a person to the tree with no family links yet (find via search; link later from Family tab). */
export const createStandalonePerson = async ({
  treeId,
  actor,
  gender = null,
}: {
  treeId: string;
  actor?: ImportActor | null;
  gender?: 'M' | 'F' | null;
}): Promise<Person> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const normalizedActor = normalizeActor(actor);
  const personRow = await insertPlaceholderPerson(treeId, normalizedActor, {
    createdVia: 'manual_standalone',
  }, gender);
  return mapDbPerson(personRow, {}, {}, {}, {});
};

const findExistingUnionRelationshipId = async (treeId: string, personA: string, personB: string) => {
  const { data, error } = await supabase
    .from('relationships')
    .select('id')
    .eq('tree_id', treeId)
    .in('type', ['marriage', 'partner'])
    .or(
      `and(person_id.eq.${personA},related_id.eq.${personB}),and(person_id.eq.${personB},related_id.eq.${personA})`
    )
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data || [])[0];
  return typeof row?.id === 'string' ? row.id : null;
};

const assertNoExistingChildLink = async (treeId: string, parentId: string, childId: string) => {
  const parentTypes = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian', 'child'];
  const { data, error } = await supabase
    .from('relationships')
    .select('id')
    .eq('tree_id', treeId)
    .in('type', parentTypes)
    .or(
      `and(person_id.eq.${parentId},related_id.eq.${childId}),and(person_id.eq.${childId},related_id.eq.${parentId})`
    )
    .limit(1);
  if (error) throw new Error(error.message);
  if ((data || []).length > 0) {
    throw new Error('This child is already linked to this parent.');
  }
};

const fetchPersonGender = async (personId: string): Promise<Person['gender'] | null> => {
  const { data, error } = await supabase.from('persons').select('gender').eq('id', personId).maybeSingle();
  if (error) throw new Error(error.message);
  const gender = data?.gender;
  return gender === 'M' || gender === 'F' || gender === 'O' ? gender : null;
};

const PARENT_LINK_TYPES_FOR_CHILD = [
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
  'child',
] as const;

const listParentLinksForChild = async (
  treeId: string,
  childId: string
): Promise<Array<{ parentId: string; type: RelationshipType }>> => {
  const { data, error } = await supabase
    .from('relationships')
    .select('person_id, type')
    .eq('tree_id', treeId)
    .eq('related_id', childId)
    .in('type', [...PARENT_LINK_TYPES_FOR_CHILD]);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => ({
      parentId: String(row.person_id),
      type: row.type as RelationshipType,
    }))
    .filter((entry) => entry.parentId);
};

const fetchPersonGenders = async (personIds: string[]): Promise<Record<string, Person['gender'] | null>> => {
  if (!personIds.length) return {};
  const { data, error } = await supabase.from('persons').select('id, gender').in('id', personIds);
  if (error) throw new Error(error.message);
  const genders: Record<string, Person['gender'] | null> = {};
  (data ?? []).forEach((row) => {
    const gender = row.gender;
    genders[String(row.id)] = gender === 'M' || gender === 'F' || gender === 'O' ? gender : null;
  });
  return genders;
};

const ensureUnionsBetweenChildParents = async ({
  treeId,
  childId,
  actorName,
}: {
  treeId: string;
  childId: string;
  actorName: string;
}) => {
  const links = await listParentLinksForChild(treeId, childId);
  if (links.length < 2) return;
  const parentIds = [...new Set(links.map((link) => link.parentId))];
  const genders = await fetchPersonGenders(parentIds);
  const pairs = inferParentPairsForUnion(
    links.map((link) => ({
      parentId: link.parentId,
      type: link.type,
      gender: genders[link.parentId] ?? null,
    }))
  );
  for (const [fatherId, motherId] of pairs) {
    await ensureUnionBetweenParents({
      treeId,
      parentId: fatherId,
      coparentId: motherId,
      actorName,
    });
  }
};

const insertParentChildLink = async ({
  treeId,
  parentId,
  childId,
  parentGender,
  metadata,
}: {
  treeId: string;
  parentId: string;
  childId: string;
  parentGender: Person['gender'] | null;
  metadata: Record<string, unknown>;
}): Promise<string> => {
  const relationshipId = randomId();
  const { error: relError } = await supabase.from('relationships').insert({
    id: relationshipId,
    tree_id: treeId,
    person_id: parentId,
    related_id: childId,
    type: inferParentRelationshipType(parentGender),
    status: 'current',
    confidence: 'Unknown',
    metadata,
  } as any);
  if (relError) throw new Error(relError.message);
  const actorName = typeof metadata.createdBy === 'string' ? metadata.createdBy : 'System';
  await ensureUnionsBetweenChildParents({ treeId, childId, actorName });
  return relationshipId;
};

const linkCoparentChildIfNeeded = async ({
  treeId,
  parentId,
  coparentId,
  childId,
  actorName,
  createdVia,
}: {
  treeId: string;
  parentId: string;
  coparentId?: string | null;
  childId: string;
  actorName: string;
  createdVia: string;
}) => {
  if (!coparentId) return;
  try {
    await assertNoExistingChildLink(treeId, coparentId, childId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already linked')) return;
    throw err;
  }
  const coparentGender = await fetchPersonGender(coparentId);
  const existingLinks = await listParentLinksForChild(treeId, childId);
  if (shouldSkipCoparentChildLink(existingLinks, coparentId, coparentGender)) return;
  await insertParentChildLink({
    treeId,
    parentId: coparentId,
    childId,
    parentGender: coparentGender,
    metadata: { createdVia, createdBy: actorName },
  });
  await ensureUnionBetweenParents({
    treeId,
    parentId,
    coparentId,
    actorName,
  });
};

const ensureUnionBetweenParents = async ({
  treeId,
  parentId,
  coparentId,
  actorName,
}: {
  treeId: string;
  parentId: string;
  coparentId: string;
  actorName: string;
}) => {
  if (parentId === coparentId) return;
  const existingRelationshipId = await findExistingUnionRelationshipId(treeId, parentId, coparentId);
  if (existingRelationshipId) return;
  const relationshipId = randomId();
  const { error } = await supabase.from('relationships').insert({
    id: relationshipId,
    tree_id: treeId,
    person_id: parentId,
    related_id: coparentId,
    type: 'marriage',
    status: 'current',
    confidence: 'Unknown',
    metadata: { createdVia: 'inferred_union_from_child', createdBy: actorName },
  } as any);
  if (error) throw new Error(error.message);
};

export const linkExistingSpouse = async ({
  treeId,
  personId,
  spouseId,
  unionType = 'marriage',
  actor,
}: {
  treeId: string;
  personId: string;
  spouseId: string;
  unionType?: 'marriage' | 'partner';
  actor?: ImportActor | null;
}): Promise<{ relationshipId: string; alreadyLinked?: boolean }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  if (personId === spouseId) {
    throw new Error('Cannot link a person to themselves.');
  }
  const existingRelationshipId = await findExistingUnionRelationshipId(treeId, personId, spouseId);
  if (existingRelationshipId) {
    await linkSharedChildrenBetweenParents({
      treeId,
      parentA: personId,
      parentB: spouseId,
      actor,
    });
    return { relationshipId: existingRelationshipId, alreadyLinked: true };
  }
  const normalizedActor = normalizeActor(actor);
  const relationshipId = randomId();
  const { error: relError } = await supabase.from('relationships').insert({
    id: relationshipId,
    tree_id: treeId,
    person_id: personId,
    related_id: spouseId,
    type: unionType,
    status: 'current',
    confidence: 'Unknown',
    metadata: { createdVia: 'manual_spouse_link', createdBy: normalizedActor.name },
  } as any);
  if (relError) throw new Error(relError.message);
  await linkSharedChildrenBetweenParents({
    treeId,
    parentA: personId,
    parentB: spouseId,
    actor,
  });
  return { relationshipId, alreadyLinked: false };
};

export const linkExistingChild = async ({
  treeId,
  parentId,
  childId,
  coparentId,
  actor,
}: {
  treeId: string;
  parentId: string;
  childId: string;
  coparentId?: string | null;
  actor?: ImportActor | null;
}): Promise<{ relationshipId: string }> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  if (parentId === childId) {
    throw new Error('Cannot link a person as their own child.');
  }
  await assertNoExistingChildLink(treeId, parentId, childId);
  const normalizedActor = normalizeActor(actor);
  const parentGender = await fetchPersonGender(parentId);
  const relationshipId = await insertParentChildLink({
    treeId,
    parentId,
    childId,
    parentGender,
    metadata: { createdVia: 'manual_child_link', createdBy: normalizedActor.name },
  });
  await linkCoparentChildIfNeeded({
    treeId,
    parentId,
    coparentId: coparentId && coparentId !== parentId ? coparentId : null,
    childId,
    actorName: normalizedActor.name,
    createdVia: 'manual_child_link_coparent',
  });
  return { relationshipId };
};

const listChildIdsForParent = async (treeId: string, parentId: string): Promise<string[]> => {
  const parentTypes = ['bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian', 'child'];
  const { data, error } = await supabase
    .from('relationships')
    .select('related_id')
    .eq('tree_id', treeId)
    .eq('person_id', parentId)
    .in('type', parentTypes);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.related_id)).filter(Boolean);
};

const listSpouseIdsForPerson = async (treeId: string, personId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('relationships')
    .select('person_id, related_id')
    .eq('tree_id', treeId)
    .in('type', ['marriage', 'partner'])
    .or(`person_id.eq.${personId},related_id.eq.${personId}`);
  if (error) throw new Error(error.message);
  const spouseIds = new Set<string>();
  (data ?? []).forEach((row: { person_id?: string; related_id?: string }) => {
    if (row.person_id === personId && row.related_id) spouseIds.add(row.related_id);
    else if (row.related_id === personId && row.person_id) spouseIds.add(row.person_id);
  });
  return Array.from(spouseIds);
};

const resolveCoparentIdFromUnion = async (
  treeId: string,
  focusPersonId: string,
  unionRelId: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('relationships')
    .select('person_id, related_id, type')
    .eq('tree_id', treeId)
    .eq('id', unionRelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.type !== 'marriage' && data.type !== 'partner')) return null;
  if (data.person_id === focusPersonId) return data.related_id ? String(data.related_id) : null;
  if (data.related_id === focusPersonId) return data.person_id ? String(data.person_id) : null;
  return null;
};

const resolveChildIdFromParentRelationship = async (
  focusPersonId: string,
  childRelId: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('relationships')
    .select('person_id, related_id')
    .eq('id', childRelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.person_id === focusPersonId) return data.related_id ? String(data.related_id) : null;
  if (data.related_id === focusPersonId) return data.person_id ? String(data.person_id) : null;
  return null;
};

/** Keep parent-child edges aligned with union assignments on the focus profile. */
export const syncUnionParentLinksFromLayout = async ({
  treeId,
  focusPersonId,
  layout,
  actor,
}: {
  treeId: string;
  focusPersonId: string;
  layout: FamilyLayoutState;
  actor?: ImportActor | null;
}): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const assignments = layout.assignments ?? {};
  const assignmentEntries = Object.entries(assignments).filter(
    ([, unionRelId]) => unionRelId && !String(unionRelId).startsWith('suggested:')
  );
  if (!assignmentEntries.length) return;

  const spouseIds = await listSpouseIdsForPerson(treeId, focusPersonId);

  for (const [childRelId, unionRelId] of assignmentEntries) {
    if (!unionRelId) continue;
    const childId = await resolveChildIdFromParentRelationship(focusPersonId, childRelId);
    if (!childId) continue;
    const coparentId = await resolveCoparentIdFromUnion(treeId, focusPersonId, String(unionRelId));
    if (!coparentId) continue;

    const links = await listParentLinksForChild(treeId, childId);
    for (const spouseId of spouseIds) {
      if (spouseId === coparentId) continue;
      if (!links.some((link) => link.parentId === spouseId)) continue;
      const { error } = await supabase
        .from('relationships')
        .delete()
        .eq('tree_id', treeId)
        .eq('person_id', spouseId)
        .eq('related_id', childId)
        .in('type', [...PARENT_LINK_TYPES_FOR_CHILD]);
      if (error) throw new Error(error.message);
    }

    try {
      await assertNoExistingChildLink(treeId, coparentId, childId);
      await linkExistingChild({ treeId, parentId: coparentId, childId, actor });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('already linked'))) {
        throw err;
      }
    }
  }
};

const linkSharedChildrenBetweenParents = async ({
  treeId,
  parentA,
  parentB,
  actor,
}: {
  treeId: string;
  parentA: string;
  parentB: string;
  actor?: ImportActor | null;
}) => {
  if (parentA === parentB) return;
  const childIds = [
    ...new Set([
      ...(await listChildIdsForParent(treeId, parentA)),
      ...(await listChildIdsForParent(treeId, parentB)),
    ]),
  ];
  for (const childId of childIds) {
    const existingLinks = await listParentLinksForChild(treeId, childId);
    for (const parentId of [parentA, parentB]) {
      const parentGender = await fetchPersonGender(parentId);
      if (shouldSkipCoparentChildLink(existingLinks, parentId, parentGender)) continue;
      try {
        await linkExistingChild({ treeId, parentId, childId, actor });
      } catch (err) {
        if (err instanceof Error && err.message.includes('already linked')) continue;
        throw err;
      }
    }
  }
};

const pruneSpuriousCoparentChildLinksForPerson = async (treeId: string, personId: string) => {
  const childIds = await listChildIdsForParent(treeId, personId);
  const parentGender = await fetchPersonGender(personId);
  for (const childId of childIds) {
    const links = await listParentLinksForChild(treeId, childId);
    if (!isSpuriousCoparentParentLink(links, personId, parentGender)) continue;
    const { error } = await supabase
      .from('relationships')
      .delete()
      .eq('tree_id', treeId)
      .eq('person_id', personId)
      .eq('related_id', childId)
      .in('type', [...PARENT_LINK_TYPES_FOR_CHILD]);
    if (error) throw new Error(error.message);
  }
};

const pruneSpuriousParentLinksForChild = async (treeId: string, childId: string) => {
  const links = await listParentLinksForChild(treeId, childId);
  const parentIds = [...new Set(links.map((link) => link.parentId))];
  if (parentIds.length < 2) return;
  const genders = await fetchPersonGenders(parentIds);
  for (const parentId of parentIds) {
    const parentGender = genders[parentId] ?? null;
    if (!isSpuriousCoparentParentLink(links, parentId, parentGender)) continue;
    const { error } = await supabase
      .from('relationships')
      .delete()
      .eq('tree_id', treeId)
      .eq('person_id', parentId)
      .eq('related_id', childId)
      .in('type', [...PARENT_LINK_TYPES_FOR_CHILD]);
    if (error) throw new Error(error.message);
  }
};

/** When spouses share children in the tree, ensure both are linked as parents (idempotent). */
export const syncSpouseChildLinksForPerson = async ({
  treeId,
  personId,
  actor,
}: {
  treeId: string;
  personId: string;
  actor?: ImportActor | null;
}): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  await pruneSpuriousCoparentChildLinksForPerson(treeId, personId);
  await pruneSpuriousParentLinksForChild(treeId, personId);
  const spouseIds = await listSpouseIdsForPerson(treeId, personId);
  for (const spouseId of spouseIds) {
    await linkSharedChildrenBetweenParents({ treeId, parentA: personId, parentB: spouseId, actor });
  }
};

/** Repair missing coparent links across an entire tree (editor maintenance; idempotent). */
export const syncSpouseChildLinksForTree = async (
  treeId: string,
  actor?: ImportActor | null
): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const { data, error } = await supabase.from('persons').select('id').eq('tree_id', treeId);
  if (error) throw new Error(error.message);
  const personIds = (data ?? []).map((row) => String(row.id)).filter(Boolean);
  for (const personId of personIds) {
    await syncSpouseChildLinksForPerson({ treeId, personId, actor });
  }
};

/** Ensure father–mother pairs who share a child also have a spousal union (idempotent). */
export const syncParentUnionsForPerson = async ({
  treeId,
  personId,
  actor,
}: {
  treeId: string;
  personId: string;
  actor?: ImportActor | null;
}): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const normalizedActor = normalizeActor(actor);
  const childIds = await listChildIdsForParent(treeId, personId);
  for (const childId of childIds) {
    await ensureUnionsBetweenChildParents({
      treeId,
      childId,
      actorName: normalizedActor.name,
    });
  }
};

/** Create marriage/partner link and ensure both parents are linked to all shared children. */
export const linkInferredFamilyUnion = async ({
  treeId,
  personId,
  partnerId,
  unionType = 'marriage',
  actor,
}: {
  treeId: string;
  personId: string;
  partnerId: string;
  unionType?: 'marriage' | 'partner';
  actor?: ImportActor | null;
}): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  if (personId === partnerId) {
    throw new Error('Cannot link a person to themselves.');
  }

  await linkExistingSpouse({ treeId, personId, spouseId: partnerId, unionType, actor });

  const childIds = [
    ...new Set([
      ...(await listChildIdsForParent(treeId, personId)),
      ...(await listChildIdsForParent(treeId, partnerId)),
    ]),
  ];

  for (const childId of childIds) {
    const existingLinks = await listParentLinksForChild(treeId, childId);
    for (const parentId of [personId, partnerId]) {
      const parentGender = await fetchPersonGender(parentId);
      if (shouldSkipCoparentChildLink(existingLinks, parentId, parentGender)) continue;
      try {
        await linkExistingChild({ treeId, parentId, childId, actor });
      } catch (err) {
        if (err instanceof Error && err.message.includes('already linked')) continue;
        throw err;
      }
    }
  }
};
