-- Administrative helper functions for managing family trees

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
    false,
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

create or replace function public.admin_delete_tree(
  target_tree_id uuid,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record public.family_trees;
begin
  select * into target_record from public.family_trees where id = target_tree_id;
  if not found then
    raise exception 'Family tree % not found', target_tree_id;
  end if;

  delete from public.family_trees where id = target_tree_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    target_tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'tree_delete',
    'family_tree',
    target_tree_id,
    jsonb_build_object('name', target_record.name)
  );
end;
$$;

create or replace function public.admin_list_trees_with_counts()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  theme_color text,
  metadata jsonb,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
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
    ft.metadata,
    ft.is_public,
    ft.created_at,
    ft.updated_at,
    ft.archived_at,
    coalesce(p_count.person_count, 0) as person_count,
    coalesce(r_count.relationship_count, 0) as relationship_count
  from public.family_trees ft
  left join (
    select tree_id, count(*) as person_count
    from public.persons
    group by tree_id
  ) p_count on p_count.tree_id = ft.id
  left join (
    select tree_id, count(*) as relationship_count
    from public.relationships
    group by tree_id
  ) r_count on r_count.tree_id = ft.id
  order by ft.created_at;
$$;
