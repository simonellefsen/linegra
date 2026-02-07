-- Ensure previously created admin trees without owners remain visible
update public.family_trees
set is_public = true
where owner_id is null
  and is_public is false;

-- Make admin-created trees public by default so anon clients can load them
create or replace function public.admin_create_tree(
  payload_name text,
  payload_description text,
  payload_metadata jsonb,
  payload_actor_id text,
  payload_actor_name text
)
returns public.family_trees
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tree public.family_trees;
begin
  insert into public.family_trees (name, description, metadata, is_public)
  values (payload_name, payload_description, coalesce(payload_metadata, '{}'::jsonb), true)
  returning * into new_tree;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (new_tree.id, payload_actor_id, coalesce(payload_actor_name, 'System'), 'tree_created', 'tree', new_tree.id, payload_metadata);

  return new_tree;
end;
$$;
