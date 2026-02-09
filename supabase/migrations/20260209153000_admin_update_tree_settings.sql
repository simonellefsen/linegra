create or replace function public.admin_update_tree_settings(
  target_tree_id uuid,
  payload_is_public boolean default null,
  payload_proband_id uuid default null,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns public.family_trees
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_tree public.family_trees;
  next_metadata jsonb;
begin
  select coalesce(metadata, '{}'::jsonb) into next_metadata
  from public.family_trees
  where id = target_tree_id
  for update;

  if not found then
    raise exception 'Family tree % not found', target_tree_id;
  end if;

  if payload_proband_id is null then
    next_metadata := next_metadata - 'defaultProbandId';
  else
    next_metadata := jsonb_set(next_metadata, '{defaultProbandId}', to_jsonb(payload_proband_id::text), true);
  end if;

  update public.family_trees
  set
    is_public = coalesce(payload_is_public, is_public),
    metadata = next_metadata,
    updated_at = now()
  where id = target_tree_id
  returning * into updated_tree;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    target_tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'tree_update',
    'family_tree',
    target_tree_id,
    jsonb_build_object(
      'is_public', updated_tree.is_public,
      'defaultProbandId', payload_proband_id
    )
  );

  return updated_tree;
end;
$$;
