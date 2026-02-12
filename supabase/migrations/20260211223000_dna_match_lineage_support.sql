create or replace function public.admin_upsert_person_dna_tests(
  target_person_id uuid,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System',
  payload_dna_tests jsonb default '[]'::jsonb,
  payload_dna_matches jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record public.persons;
  target_tree_id uuid;
  dna_item jsonb;
  match_item jsonb;
  incoming_id text;
  parsed_test_id uuid;
  parsed_type dna_test_type;
  parsed_vendor dna_vendor;
  parsed_confidence dna_match_confidence;
  test_date_value date;
  match_date_value date;
  matched_person_id uuid;
  parsed_shared_cm numeric;
  parsed_segments int;
  parsed_longest_segment numeric;
  inserted_match_id uuid;
  path_rel_id_text text;
  support_target_key text;
  support_map jsonb := '{}'::jsonb;
  rel_key text;
  dna_count int := 0;
  dna_match_count int := 0;
begin
  select *
  into target_record
  from public.persons
  where id = target_person_id
  for update;

  if not found then
    raise exception 'Person % not found', target_person_id;
  end if;

  target_tree_id := target_record.tree_id;
  support_target_key := target_person_id::text;

  delete from public.dna_tests
  where person_id = target_person_id;

  delete from public.dna_matches
  where person_id = target_person_id;

  update public.relationships r
  set metadata = jsonb_set(
    coalesce(r.metadata, '{}'::jsonb),
    '{dna_support_by_person}',
    (coalesce(r.metadata->'dna_support_by_person', '{}'::jsonb) - support_target_key),
    true
  )
  where r.tree_id = target_tree_id
    and jsonb_typeof(coalesce(r.metadata->'dna_support_by_person', '{}'::jsonb)) = 'object'
    and (coalesce(r.metadata->'dna_support_by_person', '{}'::jsonb) ? support_target_key);

  update public.relationships r
  set metadata = (coalesce(r.metadata, '{}'::jsonb) - 'dna_support_by_person')
  where r.tree_id = target_tree_id
    and r.metadata ? 'dna_support_by_person'
    and coalesce(r.metadata->'dna_support_by_person', '{}'::jsonb) = '{}'::jsonb;

  for dna_item in
    select * from jsonb_array_elements(coalesce(payload_dna_tests, '[]'::jsonb))
  loop
    incoming_id := nullif(coalesce(dna_item->>'id', ''), '');
    parsed_test_id := null;
    if incoming_id is not null and incoming_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      parsed_test_id := incoming_id::uuid;
    end if;

    parsed_type := case coalesce(dna_item->>'type', '')
      when 'Autosomal' then 'Autosomal'::dna_test_type
      when 'Shared Autosomal' then 'Shared Autosomal'::dna_test_type
      when 'Y-DNA' then 'Y-DNA'::dna_test_type
      when 'mtDNA' then 'mtDNA'::dna_test_type
      when 'X-DNA' then 'X-DNA'::dna_test_type
      else 'Other'::dna_test_type
    end;

    parsed_vendor := case coalesce(dna_item->>'vendor', '')
      when 'FamilyTreeDNA' then 'FamilyTreeDNA'::dna_vendor
      when 'AncestryDNA' then 'AncestryDNA'::dna_vendor
      when '23andMe' then '23andMe'::dna_vendor
      when 'MyHeritage' then 'MyHeritage'::dna_vendor
      when 'LivingDNA' then 'LivingDNA'::dna_vendor
      else 'Other'::dna_vendor
    end;

    test_date_value := null;
    if coalesce(dna_item->>'testDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      test_date_value := (dna_item->>'testDate')::date;
    end if;

    match_date_value := null;
    if coalesce(dna_item->>'matchDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      match_date_value := (dna_item->>'matchDate')::date;
    end if;

    insert into public.dna_tests (
      id,
      person_id,
      test_type,
      vendor,
      test_date,
      match_date,
      haplogroup,
      is_private,
      metadata,
      notes
    )
    values (
      coalesce(parsed_test_id, gen_random_uuid()),
      target_person_id,
      parsed_type,
      parsed_vendor,
      test_date_value,
      match_date_value,
      nullif(dna_item->>'haplogroup', ''),
      coalesce((dna_item->>'isPrivate')::boolean, false),
      jsonb_strip_nulls(
        coalesce(dna_item->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'testDate', nullif(dna_item->>'testDate', ''),
          'matchDate', nullif(dna_item->>'matchDate', ''),
          'testNumber', nullif(dna_item->>'testNumber', ''),
          'isConfirmed', case when dna_item ? 'isConfirmed' then to_jsonb((dna_item->>'isConfirmed')::boolean) else 'null'::jsonb end,
          'hvr1', nullif(dna_item->>'hvr1', ''),
          'hvr2', nullif(dna_item->>'hvr2', ''),
          'extraMutations', nullif(dna_item->>'extraMutations', ''),
          'codingRegion', nullif(dna_item->>'codingRegion', ''),
          'mostDistantAncestorId', nullif(dna_item->>'mostDistantAncestorId', ''),
          'rawDataSummary', coalesce(dna_item->'rawDataSummary', 'null'::jsonb),
          'rawDataPreview', coalesce(dna_item->'rawDataPreview', 'null'::jsonb),
          'sharedMatchName', nullif(dna_item->>'sharedMatchName', ''),
          'sharedMatchPersonId', nullif(dna_item->>'sharedMatchPersonId', ''),
          'sharedSegmentSummary', coalesce(dna_item->'sharedSegmentSummary', 'null'::jsonb),
          'sharedSegmentsPreview', coalesce(dna_item->'sharedSegmentsPreview', 'null'::jsonb),
          'sharedPathPersonIds', coalesce(dna_item->'sharedPathPersonIds', 'null'::jsonb),
          'sharedPathRelationshipIds', coalesce(dna_item->'sharedPathRelationshipIds', 'null'::jsonb)
        )
      ),
      nullif(dna_item->>'notes', '')
    );

    dna_count := dna_count + 1;
  end loop;

  for match_item in
    select * from jsonb_array_elements(coalesce(payload_dna_matches, '[]'::jsonb))
  loop
    matched_person_id := null;
    if coalesce(match_item->>'matched_person_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      matched_person_id := (match_item->>'matched_person_id')::uuid;
    end if;
    if matched_person_id is null then
      continue;
    end if;
    if not exists (
      select 1
      from public.persons p
      where p.id = matched_person_id and p.tree_id = target_tree_id
    ) then
      continue;
    end if;

    parsed_shared_cm := null;
    if coalesce(match_item->>'shared_cm', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      parsed_shared_cm := (match_item->>'shared_cm')::numeric;
    end if;

    parsed_segments := null;
    if coalesce(match_item->>'segments', '') ~ '^\d+$' then
      parsed_segments := (match_item->>'segments')::int;
    end if;

    parsed_longest_segment := null;
    if coalesce(match_item->>'longest_segment', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      parsed_longest_segment := (match_item->>'longest_segment')::numeric;
    end if;

    parsed_confidence := case lower(coalesce(match_item->>'confidence', ''))
      when 'high' then 'High'::dna_match_confidence
      when 'medium' then 'Medium'::dna_match_confidence
      when 'low' then 'Low'::dna_match_confidence
      else null
    end;

    insert into public.dna_matches (
      person_id,
      matched_person_id,
      shared_cm,
      segments,
      longest_segment,
      confidence,
      metadata
    )
    values (
      target_person_id,
      matched_person_id,
      parsed_shared_cm,
      parsed_segments,
      parsed_longest_segment,
      parsed_confidence,
      jsonb_strip_nulls(
        coalesce(match_item->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'path_person_ids', coalesce(match_item->'path_person_ids', '[]'::jsonb),
          'path_relationship_ids', coalesce(match_item->'path_relationship_ids', '[]'::jsonb)
        )
      )
    )
    returning id into inserted_match_id;

    dna_match_count := dna_match_count + 1;

    for path_rel_id_text in
      select distinct value
      from jsonb_array_elements_text(coalesce(match_item->'path_relationship_ids', '[]'::jsonb)) as value
    loop
      if path_rel_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        continue;
      end if;
      if not exists (
        select 1
        from public.relationships r
        where r.id = path_rel_id_text::uuid
          and r.tree_id = target_tree_id
      ) then
        continue;
      end if;
      support_map := jsonb_set(
        support_map,
        array[path_rel_id_text],
        coalesce(support_map->path_rel_id_text, '[]'::jsonb) || to_jsonb(inserted_match_id::text),
        true
      );
    end loop;
  end loop;

  for rel_key in
    select key from jsonb_object_keys(support_map) as key
  loop
    update public.relationships r
    set metadata = jsonb_set(
      coalesce(r.metadata, '{}'::jsonb),
      array['dna_support_by_person', support_target_key],
      (
        select coalesce(jsonb_agg(to_jsonb(value)), '[]'::jsonb)
        from (
          select value
          from (
            select jsonb_array_elements_text(
              coalesce(r.metadata->'dna_support_by_person'->support_target_key, '[]'::jsonb)
            ) as value
            union
            select jsonb_array_elements_text(coalesce(support_map->rel_key, '[]'::jsonb)) as value
          ) as merged_values
          where value <> ''
          order by value
        ) as ordered_values
      ),
      true
    )
    where r.id = rel_key::uuid
      and r.tree_id = target_tree_id;
  end loop;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    target_tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'person_dna_update',
    'person',
    target_person_id,
    jsonb_build_object(
      'dna_tests_count', dna_count,
      'dna_matches_count', dna_match_count,
      'supported_relationships', jsonb_object_length(support_map)
    )
  );

  return jsonb_build_object(
    'person_id', target_person_id,
    'dna_tests_count', dna_count,
    'dna_matches_count', dna_match_count,
    'supported_relationships', jsonb_object_length(support_map)
  );
end;
$$;
