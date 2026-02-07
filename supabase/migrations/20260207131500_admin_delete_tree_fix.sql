-- Ensure admin_delete_tree logs before the row is removed to avoid FK violations

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

  delete from public.family_trees where id = target_tree_id;
end;
$$;
