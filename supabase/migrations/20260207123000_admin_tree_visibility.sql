-- Ensure new family trees default to public visibility for anon access

update public.family_trees
set is_public = true
where is_public is distinct from true;

create or replace function public.admin_create_tree(
  payload_name text,
  payload_description text default null,
  payload_metadata jsonb default '{}'::jsonb,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns public.family_trees
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.family_trees;
begin
  insert into public.family_trees (name, description, metadata, owner_id, is_public, theme_color)
  values (
    payload_name,
    payload_description,
    coalesce(payload_metadata, '{}'::jsonb),
    payload_actor_id,
    true,
    '#0f172a'
  )
  returning * into inserted;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    inserted.id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'tree_create',
    'family_tree',
    inserted.id,
    jsonb_build_object('metadata', inserted.metadata)
  );

  return inserted;
end;
$$;
