-- Roadmap A: Supabase Auth + collaborator management
-- - Restore real can_write_tree (remove temporary public-tree write bypass)
-- - Auth helpers + RPC guards
-- - Collaborator invite/list/update/remove
-- - First registered user becomes superadmin

-- ---------------------------------------------------------------------------
-- 1. Auth helper predicates
-- ---------------------------------------------------------------------------

create or replace function public.can_write_tree(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_trees ft
    where ft.id = target_tree_id
      and auth.uid() is not null
      and (
        ft.owner_id = auth.uid()
        or exists (
          select 1 from public.tree_collaborators tc
          where tc.tree_id = ft.id
            and tc.profile_id = auth.uid()
            and tc.status = 'active'
            and tc.role in ('owner', 'editor')
        )
      )
  );
$$;

create or replace function public.is_tree_owner(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_trees ft
    where ft.id = target_tree_id and ft.owner_id = auth.uid()
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  );
$$;

create or replace function public.assert_authenticated()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
end;
$$;

create or replace function public.assert_can_write_tree(target_tree_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_authenticated();
  if not public.can_write_tree(target_tree_id) then
    raise exception 'Not authorized to modify this tree';
  end if;
end;
$$;

create or replace function public.assert_tree_owner(target_tree_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_authenticated();
  if not public.is_tree_owner(target_tree_id) then
    raise exception 'Tree owner privileges required';
  end if;
end;
$$;

create or replace function public.assert_superadmin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_authenticated();
  if not public.is_superadmin() then
    raise exception 'Super administrator privileges required';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. First user bootstrap + invite acceptance
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role text;
begin
  if (select count(*) from public.profiles) = 0 then
    next_role := 'superadmin';
  else
    next_role := 'researcher';
  end if;

  insert into public.profiles (id, full_name, display_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    next_role
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();

  return new;
end;
$$;

create or replace function public.accept_pending_collaborator_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  updated_count integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    return 0;
  end if;

  update public.tree_collaborators tc
  set profile_id = auth.uid(),
      status = 'active',
      responded_at = now()
  where tc.profile_id is null
    and tc.status = 'invited'
    and tc.invitation_email is not null
    and lower(tc.invitation_email) = lower(user_email);

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.get_my_tree_role(target_tree_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.is_tree_owner(target_tree_id) then 'owner'
    else (
      select tc.role
      from public.tree_collaborators tc
      where tc.tree_id = target_tree_id
        and tc.profile_id = auth.uid()
        and tc.status = 'active'
      limit 1
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tree listing (respect can_read_tree)
-- ---------------------------------------------------------------------------

drop function if exists public.admin_list_trees_with_counts();

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
  relationship_count bigint,
  my_role text
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
    coalesce(r_count.relationship_count, 0) as relationship_count,
    public.get_my_tree_role(ft.id) as my_role
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
  where public.can_read_tree(ft.id)
  order by ft.created_at;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tree create / delete / settings (auth-gated)
-- ---------------------------------------------------------------------------

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
  actor_id uuid;
  actor_name text;
begin
  perform public.assert_authenticated();
  actor_id := coalesce(payload_actor_id, auth.uid());
  actor_name := coalesce(nullif(btrim(payload_actor_name), ''), 'System');

  insert into public.family_trees (name, description, metadata, owner_id, is_public, theme_color)
  values (
    payload_name,
    payload_description,
    coalesce(payload_metadata, '{}'::jsonb),
    auth.uid(),
    true,
    '#0f172a'
  )
  returning * into inserted;

  insert into public.tree_collaborators (tree_id, profile_id, role, status, added_by)
  values (inserted.id, auth.uid(), 'owner', 'active', auth.uid())
  on conflict do nothing;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    inserted.id,
    actor_id::text,
    actor_name,
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
set statement_timeout = 0
set lock_timeout = 0
as $$
declare
  target_record public.family_trees;
begin
  perform public.assert_tree_owner(target_tree_id);

  select * into target_record from public.family_trees where id = target_tree_id;
  if not found then
    raise exception 'Family tree % not found', target_tree_id;
  end if;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    target_tree_id,
    coalesce(payload_actor_id::text, auth.uid()::text),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System'),
    'tree_delete',
    'family_tree',
    target_tree_id,
    jsonb_build_object('name', target_record.name)
  );

  delete from public.tree_collaborators where tree_id = target_tree_id;
  delete from public.audit_logs where tree_id = target_tree_id;
  delete from public.citations where tree_id = target_tree_id;
  delete from public.notes where tree_id = target_tree_id;
  delete from public.media_person_links where person_id in (select id from public.persons where tree_id = target_tree_id);
  delete from public.media_event_links where person_event_id in (
    select pe.id from public.person_events pe
    join public.persons p on p.id = pe.person_id
    where p.tree_id = target_tree_id
  );
  delete from public.media_relationship_links where relationship_id in (
    select id from public.relationships where tree_id = target_tree_id
  );
  delete from public.media_items where tree_id = target_tree_id;
  delete from public.dna_matches where person_id in (select id from public.persons where tree_id = target_tree_id);
  delete from public.dna_tests where person_id in (select id from public.persons where tree_id = target_tree_id);
  delete from public.person_events where person_id in (select id from public.persons where tree_id = target_tree_id);
  delete from public.relationships where tree_id = target_tree_id;
  delete from public.persons where tree_id = target_tree_id;
  delete from public.places where tree_id = target_tree_id;
  delete from public.sources where tree_id = target_tree_id;
  delete from public.gedcom_imports where tree_id = target_tree_id;
  delete from public.family_trees where id = target_tree_id;
end;
$$;

-- Patch tree settings: add write guard at top of existing body
create or replace function public.admin_update_tree_settings(
  target_tree_id uuid,
  payload_is_public boolean default null,
  payload_proband_id uuid default null,
  payload_proband_label text default null,
  payload_description text default null,
  payload_owner_name text default null,
  payload_owner_email text default null,
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
begin
  perform public.assert_can_write_tree(target_tree_id);

  select coalesce(metadata, '{}'::jsonb) into next_metadata
  from public.family_trees
  where id = target_tree_id
  for update;

  if not found then
    raise exception 'Family tree % not found', target_tree_id;
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

create or replace function public.admin_nuke_database(confirm_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_superadmin();

  if confirm_text is distinct from 'NUKE' then
    raise exception 'Confirmation text mismatch';
  end if;

  truncate table
    public.audit_logs,
    public.citations,
    public.notes,
    public.media_person_links,
    public.media_event_links,
    public.media_relationship_links,
    public.media_items,
    public.dna_matches,
    public.dna_tests,
    public.person_events,
    public.relationships,
    public.persons,
    public.places,
    public.sources,
    public.gedcom_imports,
    public.tree_collaborators,
    public.family_trees
  restart identity cascade;
end;
$$;

-- Relationship RPC guards
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
  select * into rel_record from public.relationships where id = target_relationship_id for update;
  if not found then
    raise exception 'Relationship % not found', target_relationship_id;
  end if;
  perform public.assert_can_write_tree(rel_record.tree_id);

  update public.relationships set confidence = payload_confidence where id = target_relationship_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    rel_record.tree_id,
    coalesce(payload_actor_id::text, auth.uid()::text),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System'),
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
  select * into rel_record from public.relationships where id = target_relationship_id;
  if not found then
    raise exception 'Relationship % not found', target_relationship_id;
  end if;
  perform public.assert_can_write_tree(rel_record.tree_id);

  delete from public.relationships where id = target_relationship_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    rel_record.tree_id,
    coalesce(payload_actor_id::text, auth.uid()::text),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System'),
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

-- ---------------------------------------------------------------------------
-- 5. Collaborator management RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_tree_collaborators(target_tree_id uuid)
returns table (
  id uuid,
  tree_id uuid,
  profile_id uuid,
  invitation_email text,
  role text,
  status text,
  display_name text,
  email text,
  invited_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    tc.id,
    tc.tree_id,
    tc.profile_id,
    tc.invitation_email,
    tc.role,
    tc.status,
    coalesce(p.display_name, p.full_name, split_part(au.email, '@', 1)) as display_name,
    coalesce(au.email, tc.invitation_email) as email,
    tc.invited_at,
    tc.responded_at
  from public.tree_collaborators tc
  left join public.profiles p on p.id = tc.profile_id
  left join auth.users au on au.id = tc.profile_id
  where tc.tree_id = target_tree_id
    and public.can_read_tree(target_tree_id)
  order by tc.invited_at;
$$;

create or replace function public.invite_tree_collaborator(
  target_tree_id uuid,
  payload_email text,
  payload_role text default 'editor'
)
returns public.tree_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_email text;
  normalized_role text;
  existing_profile_id uuid;
  inserted public.tree_collaborators;
begin
  perform public.assert_tree_owner(target_tree_id);

  trimmed_email := lower(nullif(btrim(payload_email), ''));
  if trimmed_email is null then
    raise exception 'Invitation email is required';
  end if;

  normalized_role := case
    when lower(payload_role) in ('owner', 'editor') then lower(payload_role)
    else 'editor'
  end;

  if normalized_role = 'owner' then
    raise exception 'Cannot invite additional owners; transfer ownership is not supported yet';
  end if;

  select au.id into existing_profile_id
  from auth.users au
  where lower(au.email) = trimmed_email
  limit 1;

  if existing_profile_id is not null then
    select * into inserted
    from public.tree_collaborators tc
    where tc.tree_id = target_tree_id and tc.profile_id = existing_profile_id
    limit 1;

    if found then
      update public.tree_collaborators
      set role = normalized_role,
          status = 'active',
          invitation_email = null,
          added_by = auth.uid(),
          responded_at = now()
      where id = inserted.id
      returning * into inserted;
    else
      insert into public.tree_collaborators (tree_id, profile_id, role, status, added_by, responded_at)
      values (target_tree_id, existing_profile_id, normalized_role, 'active', auth.uid(), now())
      returning * into inserted;
    end if;
  else
    select * into inserted
    from public.tree_collaborators tc
    where tc.tree_id = target_tree_id
      and tc.invitation_email is not null
      and lower(tc.invitation_email) = trimmed_email
    limit 1;

    if found then
      update public.tree_collaborators
      set role = normalized_role,
          status = 'invited',
          added_by = auth.uid(),
          invited_at = now()
      where id = inserted.id
      returning * into inserted;
    else
      insert into public.tree_collaborators (tree_id, invitation_email, role, status, added_by)
      values (target_tree_id, trimmed_email, normalized_role, 'invited', auth.uid())
      returning * into inserted;
    end if;
  end if;

  return inserted;
end;
$$;

create or replace function public.update_tree_collaborator(
  target_collaborator_id uuid,
  payload_role text default null,
  payload_status text default null
)
returns public.tree_collaborators
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.tree_collaborators;
  updated public.tree_collaborators;
begin
  select * into target from public.tree_collaborators where id = target_collaborator_id;
  if not found then
    raise exception 'Collaborator % not found', target_collaborator_id;
  end if;

  perform public.assert_tree_owner(target.tree_id);

  if target.role = 'owner' and payload_role is not null and lower(payload_role) <> 'owner' then
    raise exception 'Cannot demote the tree owner';
  end if;

  update public.tree_collaborators
  set
    role = coalesce(nullif(lower(payload_role), ''), role),
    status = coalesce(nullif(lower(payload_status), ''), status),
    responded_at = case
      when payload_status is not null and lower(payload_status) = 'active' then now()
      else responded_at
    end
  where id = target_collaborator_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function public.remove_tree_collaborator(target_collaborator_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.tree_collaborators;
begin
  select * into target from public.tree_collaborators where id = target_collaborator_id;
  if not found then
    raise exception 'Collaborator % not found', target_collaborator_id;
  end if;

  perform public.assert_tree_owner(target.tree_id);

  if target.role = 'owner' then
    raise exception 'Cannot remove the tree owner';
  end if;

  delete from public.tree_collaborators where id = target_collaborator_id;
end;
$$;

-- Superadmin can claim ownerless legacy trees
create or replace function public.admin_claim_tree_ownership(target_tree_id uuid)
returns public.family_trees
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.family_trees;
begin
  perform public.assert_superadmin();

  update public.family_trees
  set owner_id = auth.uid(), updated_at = now()
  where id = target_tree_id and owner_id is null
  returning * into updated;

  if not found then
    raise exception 'Tree not found or already has an owner';
  end if;

  if not exists (
    select 1 from public.tree_collaborators tc
    where tc.tree_id = target_tree_id and tc.profile_id = auth.uid()
  ) then
    insert into public.tree_collaborators (tree_id, profile_id, role, status, added_by, responded_at)
    values (target_tree_id, auth.uid(), 'owner', 'active', auth.uid(), now());
  else
    update public.tree_collaborators
    set role = 'owner', status = 'active', responded_at = now()
    where tree_id = target_tree_id and profile_id = auth.uid();
  end if;

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Restrict mutating admin RPCs to authenticated role
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_tree(text, text, jsonb, uuid, text) from public, anon;
revoke all on function public.admin_delete_tree(uuid, uuid, text) from public, anon;
revoke all on function public.admin_update_tree_settings(uuid, boolean, uuid, text, text, text, text, uuid, text) from public, anon;
revoke all on function public.admin_nuke_database(text) from public, anon;
revoke all on function public.admin_set_relationship_confidence(uuid, relationship_confidence, uuid, text) from public, anon;
revoke all on function public.admin_unlink_relationship(uuid, uuid, text) from public, anon;
revoke all on function public.invite_tree_collaborator(uuid, text, text) from public, anon;
revoke all on function public.update_tree_collaborator(uuid, text, text) from public, anon;
revoke all on function public.remove_tree_collaborator(uuid) from public, anon;
revoke all on function public.admin_claim_tree_ownership(uuid) from public, anon;

grant execute on function public.admin_create_tree(text, text, jsonb, uuid, text) to authenticated;
grant execute on function public.admin_delete_tree(uuid, uuid, text) to authenticated;
grant execute on function public.admin_update_tree_settings(uuid, boolean, uuid, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.admin_nuke_database(text) to authenticated;
grant execute on function public.admin_set_relationship_confidence(uuid, relationship_confidence, uuid, text) to authenticated;
grant execute on function public.admin_unlink_relationship(uuid, uuid, text) to authenticated;
grant execute on function public.invite_tree_collaborator(uuid, text, text) to authenticated;
grant execute on function public.update_tree_collaborator(uuid, text, text) to authenticated;
grant execute on function public.remove_tree_collaborator(uuid) to authenticated;
grant execute on function public.admin_claim_tree_ownership(uuid) to authenticated;

grant execute on function public.accept_pending_collaborator_invites() to authenticated;
grant execute on function public.get_my_tree_role(uuid) to authenticated, anon;
grant execute on function public.list_tree_collaborators(uuid) to authenticated, anon;

select pg_notify('pgrst', 'reload schema');
