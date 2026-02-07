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

create or replace function public.admin_list_trees_with_counts()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  theme_color text,
  is_public boolean,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  person_count bigint,
  relationship_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    ft.id,
    ft.owner_id,
    ft.name,
    ft.description,
    ft.theme_color,
    ft.is_public,
    ft.metadata,
    ft.created_at,
    ft.updated_at,
    coalesce(p.person_count, 0),
    coalesce(r.relationship_count, 0)
  from public.family_trees ft
  left join (
    select tree_id, count(*) as person_count
    from public.persons
    group by tree_id
  ) p on p.tree_id = ft.id
  left join (
    select tree_id, count(*) as relationship_count
    from public.relationships
    group by tree_id
  ) r on r.tree_id = ft.id
  order by ft.created_at;
$$;

create or replace function public.admin_delete_tree(target_tree_id uuid, payload_actor_id text, payload_actor_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_tree record;
begin
  select * into deleted_tree
  from public.family_trees
  where id = target_tree_id;

  if deleted_tree is null then
    raise exception 'Tree % not found', target_tree_id;
  end if;

  delete from public.family_trees
  where id = target_tree_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (target_tree_id, payload_actor_id, coalesce(payload_actor_name, 'System'), 'tree_deleted', 'tree', target_tree_id, jsonb_build_object('name', deleted_tree.name));
end;
$$;
