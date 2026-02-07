create or replace function public.admin_nuke_database(confirm_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
