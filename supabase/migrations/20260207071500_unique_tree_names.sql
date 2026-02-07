-- Enforce globally unique family tree names (case-insensitive)

drop index if exists family_trees_owner_name_idx;

create unique index if not exists family_trees_unique_name_idx
  on public.family_trees (lower(name));

comment on index family_trees_unique_name_idx is 'Ensures each family tree name is globally unique regardless of case.';
