-- Keep audit logs when trees are deleted and avoid FK violations

alter table public.audit_logs
  drop constraint if exists audit_logs_tree_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_tree_id_fkey
  foreign key (tree_id)
  references public.family_trees (id)
  on delete set null;

create or replace function public.admin_delete_tree(
  target_tree_id uuid,
  payload_actor_id text,
  payload_actor_name text
)
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

  insert into public.audit_logs (
    tree_id,
    actor_id,
    actor_name,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    target_tree_id,
    payload_actor_id,
    coalesce(payload_actor_name, 'System'),
    'tree_deleted',
    'tree',
    target_tree_id,
    jsonb_build_object(
      'name', deleted_tree.name,
      'personCount', (select count(*) from public.persons where tree_id = target_tree_id),
      'relationshipCount', (select count(*) from public.relationships where tree_id = target_tree_id)
    )
  );

  delete from public.family_trees
  where id = target_tree_id;
end;
$$;
