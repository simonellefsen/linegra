-- Performance indexes for large archives (2026-02-08)

create index if not exists persons_tree_last_first_idx
  on public.persons (tree_id, lower(last_name), lower(first_name));

create index if not exists persons_tree_updated_idx
  on public.persons (tree_id, updated_at desc);

create index if not exists relationships_tree_person_idx
  on public.relationships (tree_id, person_id);

create index if not exists relationships_tree_related_idx
  on public.relationships (tree_id, related_id);

create index if not exists notes_person_idx
  on public.notes (person_id);
