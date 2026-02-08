-- Relationship maintenance RPCs (confidence + unlink)

create or replace function public.admin_set_relationship_confidence(
  target_relationship_id uuid,
  payload_confidence relationship_confidence,
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
begin
  select *
  into rel_record
  from public.relationships
  where id = target_relationship_id
  for update;

  if not found then
    raise exception 'Relationship % not found', target_relationship_id;
  end if;

  update public.relationships
  set confidence = payload_confidence
  where id = target_relationship_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    rel_record.tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'relationship_confidence',
    'relationship',
    target_relationship_id,
    jsonb_build_object('confidence', payload_confidence)
  );
end;
$$;

create or replace function public.admin_unlink_relationship(
  target_relationship_id uuid,
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
begin
  select *
  into rel_record
  from public.relationships
  where id = target_relationship_id;

  if not found then
    raise exception 'Relationship % not found', target_relationship_id;
  end if;

  delete from public.relationships
  where id = target_relationship_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    rel_record.tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'relationship_unlink',
    'relationship',
    target_relationship_id,
    jsonb_build_object(
      'person_id', rel_record.person_id,
      'related_id', rel_record.related_id,
      'type', rel_record.type
    )
  );
end;
$$;
