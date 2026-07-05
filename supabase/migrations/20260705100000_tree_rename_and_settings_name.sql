-- Allow renaming trees via admin settings and rename Gether-Nielsen → Gether-Gamby.

create or replace function public.admin_update_tree_settings(
  target_tree_id uuid,
  payload_is_public boolean default null,
  payload_proband_id uuid default null,
  payload_proband_label text default null,
  payload_description text default null,
  payload_owner_name text default null,
  payload_owner_email text default null,
  payload_name text default null,
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
  trimmed_owner_name text;
  trimmed_owner_email text;
  trimmed_name text;
begin
  perform public.assert_can_write_tree(target_tree_id);

  select coalesce(metadata, '{}'::jsonb) into next_metadata
  from public.family_trees
  where id = target_tree_id
  for update;

  if not found then
    raise exception 'Family tree % not found', target_tree_id;
  end if;

  if payload_name is not null then
    trimmed_name := nullif(btrim(payload_name), '');
    if trimmed_name is null then
      raise exception 'Tree name cannot be empty';
    end if;
    if exists (
      select 1
      from public.family_trees ft
      where lower(ft.name) = lower(trimmed_name)
        and ft.id <> target_tree_id
    ) then
      raise exception 'A family tree with this name already exists';
    end if;
  end if;

  if payload_proband_id is null then
    next_metadata := next_metadata - 'defaultProbandId';
    next_metadata := next_metadata - 'defaultProbandLabel';
  else
    next_metadata := jsonb_set(next_metadata, '{defaultProbandId}', to_jsonb(payload_proband_id::text), true);
    if payload_proband_label is not null then
      next_metadata := jsonb_set(next_metadata, '{defaultProbandLabel}', to_jsonb(payload_proband_label), true);
    end if;
  end if;

  if payload_owner_name is not null then
    trimmed_owner_name := nullif(btrim(payload_owner_name), '');
    if trimmed_owner_name is null then
      next_metadata := next_metadata - 'owner_name';
    else
      next_metadata := jsonb_set(next_metadata, '{owner_name}', to_jsonb(trimmed_owner_name), true);
    end if;
  end if;

  if payload_owner_email is not null then
    trimmed_owner_email := nullif(btrim(payload_owner_email), '');
    if trimmed_owner_email is null then
      next_metadata := next_metadata - 'owner_email';
    else
      next_metadata := jsonb_set(next_metadata, '{owner_email}', to_jsonb(trimmed_owner_email), true);
    end if;
  end if;

  update public.family_trees
  set
    name = case when trimmed_name is not null then trimmed_name else name end,
    is_public = coalesce(payload_is_public, is_public),
    description = case when payload_description is not null then payload_description else description end,
    metadata = next_metadata,
    updated_at = now()
  where id = target_tree_id
  returning * into updated_tree;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    target_tree_id,
    coalesce(payload_actor_id::text, auth.uid()::text),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System'),
    'tree_update',
    'family_tree',
    target_tree_id,
    jsonb_build_object(
      'name', updated_tree.name,
      'is_public', updated_tree.is_public,
      'defaultProbandId', payload_proband_id,
      'defaultProbandLabel', payload_proband_label,
      'description', updated_tree.description,
      'owner_name', next_metadata ->> 'owner_name',
      'owner_email', next_metadata ->> 'owner_email'
    )
  );

  return updated_tree;
end;
$$;

revoke all on function public.admin_update_tree_settings(uuid, boolean, uuid, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.admin_update_tree_settings(uuid, boolean, uuid, text, text, text, text, text, uuid, text) to authenticated;

update public.family_trees
set name = 'Gether-Gamby', updated_at = now()
where lower(name) = lower('Gether-Nielsen');

select pg_notify('pgrst', 'reload schema');
