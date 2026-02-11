-- Improve large tree deletions and avoid statement timeouts.

create index if not exists relationships_person_idx on public.relationships(person_id);
create index if not exists relationships_related_idx on public.relationships(related_id);
create index if not exists places_tree_idx on public.places(tree_id);
create index if not exists media_items_tree_idx on public.media_items(tree_id);
create index if not exists citations_tree_idx on public.citations(tree_id);
create index if not exists citations_person_event_idx on public.citations(person_event_id);
create index if not exists citations_relationship_idx on public.citations(relationship_id);
create index if not exists notes_tree_idx on public.notes(tree_id);
create index if not exists notes_person_event_idx on public.notes(person_event_id);
create index if not exists notes_relationship_idx on public.notes(relationship_id);
create index if not exists media_person_links_person_idx on public.media_person_links(person_id);
create index if not exists media_event_links_event_idx on public.media_event_links(person_event_id);
create index if not exists media_relationship_links_relationship_idx on public.media_relationship_links(relationship_id);
create index if not exists dna_tests_person_idx on public.dna_tests(person_id);
create index if not exists dna_matches_person_idx on public.dna_matches(person_id);
create index if not exists dna_matches_matched_person_idx on public.dna_matches(matched_person_id);
create index if not exists gedcom_imports_tree_idx on public.gedcom_imports(tree_id);

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

  -- Remove dependent rows in bulk to avoid heavy FK cascade planning/execution.
  delete from public.media_event_links mel
  where exists (
    select 1
    from public.person_events pe
    join public.persons p on p.id = pe.person_id
    where pe.id = mel.person_event_id
      and p.tree_id = target_tree_id
  );

  delete from public.media_relationship_links mrl
  where exists (
    select 1
    from public.relationships r
    where r.id = mrl.relationship_id
      and r.tree_id = target_tree_id
  );

  delete from public.media_person_links mpl
  where exists (
    select 1
    from public.persons p
    where p.id = mpl.person_id
      and p.tree_id = target_tree_id
  );

  delete from public.dna_matches dm
  where exists (
    select 1
    from public.persons p
    where p.id = dm.person_id
      and p.tree_id = target_tree_id
  )
  or exists (
    select 1
    from public.persons p
    where p.id = dm.matched_person_id
      and p.tree_id = target_tree_id
  );

  delete from public.dna_tests dt
  where exists (
    select 1
    from public.persons p
    where p.id = dt.person_id
      and p.tree_id = target_tree_id
  );

  delete from public.citations where tree_id = target_tree_id;
  delete from public.notes where tree_id = target_tree_id;

  delete from public.person_events pe
  using public.persons p
  where pe.person_id = p.id
    and p.tree_id = target_tree_id;

  delete from public.relationships where tree_id = target_tree_id;
  delete from public.sources where tree_id = target_tree_id;
  delete from public.media_items where tree_id = target_tree_id;
  delete from public.persons where tree_id = target_tree_id;
  delete from public.places where tree_id = target_tree_id;
  delete from public.tree_collaborators where tree_id = target_tree_id;
  delete from public.gedcom_imports where tree_id = target_tree_id;
  delete from public.family_trees where id = target_tree_id;
end;
$$;
