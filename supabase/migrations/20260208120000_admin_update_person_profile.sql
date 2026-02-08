-- RPC to atomically update a person's core profile + associated notes/events

create or replace function public.admin_update_person_profile(
  target_person_id uuid,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System',
  payload_profile jsonb default '{}'::jsonb,
  payload_events jsonb default '[]'::jsonb,
  payload_notes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record public.persons;
  base_metadata jsonb;
  alt_names jsonb;
  tree_id uuid;
  event_item jsonb;
  note_item jsonb;
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

  alt_names := coalesce(
    payload_profile->'alternate_names',
    payload_profile->'alternateNames',
    target_record.metadata->'alternateNames',
    '[]'::jsonb
  );

  base_metadata := coalesce(target_record.metadata, '{}'::jsonb) - 'alternateNames';
  base_metadata := jsonb_strip_nulls(base_metadata || coalesce(payload_profile->'metadata', '{}'::jsonb));
  base_metadata := jsonb_set(base_metadata, '{alternateNames}', alt_names, true);

  update public.persons
  set
    first_name = coalesce(payload_profile->>'first_name', payload_profile->>'firstName', first_name),
    last_name = coalesce(payload_profile->>'last_name', payload_profile->>'lastName', last_name),
    maiden_name = coalesce(payload_profile->>'maiden_name', payload_profile->>'maidenName', maiden_name),
    birth_date_text = coalesce(payload_profile->>'birth_date_text', payload_profile->>'birthDate', birth_date_text),
    birth_place_text = coalesce(payload_profile->>'birth_place_text', payload_profile->>'birthPlaceText', birth_place_text),
    death_date_text = coalesce(payload_profile->>'death_date_text', payload_profile->>'deathDate', death_date_text),
    death_place_text = coalesce(payload_profile->>'death_place_text', payload_profile->>'deathPlaceText', death_place_text),
    residence_at_death_text = coalesce(payload_profile->>'residence_at_death_text', payload_profile->>'residenceAtDeathText', residence_at_death_text),
    burial_date_text = coalesce(payload_profile->>'burial_date_text', payload_profile->>'burialDate', burial_date_text),
    burial_place_text = coalesce(payload_profile->>'burial_place_text', payload_profile->>'burialPlaceText', burial_place_text),
    death_cause = coalesce(payload_profile->>'death_cause', payload_profile->>'deathCause', death_cause),
    death_cause_category = coalesce(payload_profile->>'death_cause_category', payload_profile->>'deathCauseCategory', death_cause_category),
    metadata = base_metadata,
    updated_at = now()
  where id = target_person_id
  returning * into target_record;

  delete from public.person_events
  where person_id = target_person_id;

  for event_item in
    select * from jsonb_array_elements(coalesce(payload_events, '[]'::jsonb))
  loop
    insert into public.person_events (
      person_id,
      event_type,
      date_text,
      place_text,
      description,
      employer,
      metadata
    )
    values (
      target_person_id,
      coalesce(event_item->>'event_type', event_item->>'type', 'Custom'),
      coalesce(event_item->>'date_text', event_item->>'date'),
      coalesce(event_item->>'place_text', event_item->>'place'),
      event_item->>'description',
      event_item->>'employer',
      coalesce(event_item->'metadata', '{}'::jsonb)
    );
  end loop;

  delete from public.notes
  where person_id = target_person_id;

  for note_item in
    select * from jsonb_array_elements(coalesce(payload_notes, '[]'::jsonb))
  loop
    insert into public.notes (
      id,
      tree_id,
      person_id,
      type,
      body,
      event_label,
      note_date_text,
      is_private
    )
    values (
      coalesce((note_item->>'id')::uuid, gen_random_uuid()),
      tree_id,
      target_person_id,
      coalesce((note_item->>'type')::note_type, 'Generic'),
      coalesce(note_item->>'body', ''),
      coalesce(note_item->>'event_label', note_item->>'eventLabel'),
      coalesce(note_item->>'note_date_text', note_item->>'noteDate'),
      coalesce((note_item->>'is_private')::boolean, false)
    );
  end loop;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'person_update',
    'person',
    target_person_id,
    jsonb_build_object(
      'profile',
      payload_profile,
      'events_count',
      jsonb_array_length(coalesce(payload_events, '[]'::jsonb)),
      'notes_count',
      jsonb_array_length(coalesce(payload_notes, '[]'::jsonb))
    )
  );

  return jsonb_build_object(
    'person_id', target_person_id,
    'updated_at', target_record.updated_at
  );
end;
$$;
