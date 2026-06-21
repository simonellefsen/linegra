-- Allow a spousal union's type to be flipped between "marriage" and "partner".
--
-- GEDCOM 7.x has no dedicated cohabiting-partner union: the standard only models families via
-- FAM/HUSB/WIFE plus a MARR event (an unmarried partnership can at best be hinted at with
-- `2 TYPE COMMON LAW`). Linegra therefore keeps its own `partner` relationship type to record a
-- couple that lived together but never married. This extends `admin_update_relationship_details`
-- with an optional `payload_union_type` so an editor can correct a union's kind from the profile
-- (e.g. change an imported "marriage" into a "partner" union). The change is guarded: only the two
-- union types are accepted, so the call can never re-type a parental/guardian link.

create or replace function public.admin_update_relationship_details(
  target_relationship_id uuid,
  payload_date_text text default null,
  payload_place_text text default null,
  payload_status relationship_status default null,
  payload_notes text default null,
  payload_union_type text default null,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rel_record public.relationships;
  next_metadata jsonb;
  normalized_date text;
  normalized_place text;
  normalized_notes text;
  requested_union_type text;
begin
  select *
  into rel_record
  from public.relationships
  where id = target_relationship_id
  for update;

  if not found then
    raise exception 'Relationship % not found', target_relationship_id;
  end if;

  -- Only the two union types are permitted; anything else (including parental types) is ignored.
  requested_union_type := nullif(trim(coalesce(payload_union_type, '')), '');
  if requested_union_type is not null and requested_union_type not in ('marriage', 'partner') then
    raise exception 'Invalid union type %. Only "marriage" or "partner" is allowed.', requested_union_type;
  end if;

  normalized_date := nullif(trim(coalesce(payload_date_text, '')), '');
  normalized_place := nullif(trim(coalesce(payload_place_text, '')), '');
  normalized_notes := nullif(trim(coalesce(payload_notes, '')), '');
  next_metadata := coalesce(rel_record.metadata, '{}'::jsonb);

  if normalized_date is null then
    next_metadata := next_metadata - 'date_text' - 'relationship_date_text';
  else
    next_metadata := jsonb_set(next_metadata, '{date_text}', to_jsonb(normalized_date), true);
  end if;

  if normalized_place is null then
    next_metadata := next_metadata - 'place_text' - 'relationship_place_text';
  else
    next_metadata := jsonb_set(next_metadata, '{place_text}', to_jsonb(normalized_place), true);
  end if;

  update public.relationships
  set
    type = case
      when requested_union_type is not null then requested_union_type::relationship_type
      else type
    end,
    status = payload_status,
    notes = normalized_notes,
    metadata = next_metadata
  where id = target_relationship_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    rel_record.tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'relationship_update',
    'relationship',
    target_relationship_id,
    jsonb_build_object(
      'date_text', normalized_date,
      'place_text', normalized_place,
      'status', payload_status,
      'notes', normalized_notes,
      'union_type', requested_union_type
    )
  );
end;
$$;
