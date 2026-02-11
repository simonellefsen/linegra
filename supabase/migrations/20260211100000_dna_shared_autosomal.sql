alter type public.dna_test_type add value if not exists 'Shared Autosomal';

create or replace function public.admin_upsert_person_dna_tests(
  target_person_id uuid,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System',
  payload_dna_tests jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record public.persons;
  tree_id uuid;
  dna_item jsonb;
  incoming_id text;
  parsed_id uuid;
  parsed_type dna_test_type;
  parsed_vendor dna_vendor;
  test_date_value date;
  match_date_value date;
  dna_count int := 0;
begin
  select *
  into target_record
  from public.persons
  where id = target_person_id
  for update;

  if not found then
    raise exception 'Person % not found', target_person_id;
  end if;

  tree_id := target_record.tree_id;

  delete from public.dna_tests
  where person_id = target_person_id;

  for dna_item in
    select * from jsonb_array_elements(coalesce(payload_dna_tests, '[]'::jsonb))
  loop
    incoming_id := nullif(coalesce(dna_item->>'id', ''), '');
    parsed_id := null;
    if incoming_id is not null and incoming_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      parsed_id := incoming_id::uuid;
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
      coalesce(parsed_id, gen_random_uuid()),
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
          'sharedSegmentSummary', coalesce(dna_item->'sharedSegmentSummary', 'null'::jsonb),
          'sharedSegmentsPreview', coalesce(dna_item->'sharedSegmentsPreview', 'null'::jsonb)
        )
      ),
      nullif(dna_item->>'notes', '')
    );

    dna_count := dna_count + 1;
  end loop;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'person_dna_update',
    'person',
    target_person_id,
    jsonb_build_object('dna_tests_count', dna_count)
  );

  return jsonb_build_object(
    'person_id', target_person_id,
    'dna_tests_count', dna_count
  );
end;
$$;
