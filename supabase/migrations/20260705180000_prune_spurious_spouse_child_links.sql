-- Remove spouse-sync artifacts: generic child links when both bio parents are already assigned.

delete from public.relationships r
where r.type = 'child'
  and exists (
    select 1
    from public.relationships father
    where father.tree_id = r.tree_id
      and father.related_id = r.related_id
      and father.type = 'bio_father'
      and father.person_id <> r.person_id
  )
  and exists (
    select 1
    from public.relationships mother
    where mother.tree_id = r.tree_id
      and mother.related_id = r.related_id
      and mother.type = 'bio_mother'
      and mother.person_id <> r.person_id
  );
