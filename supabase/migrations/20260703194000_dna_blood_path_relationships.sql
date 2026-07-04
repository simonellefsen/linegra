-- DNA lineage paths must follow biological parent/child edges only (no marriage/partner).

create or replace function public.load_dna_path_relationships(target_tree_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(path_rows)), '[]'::jsonb)
  from (
    select
      r.id,
      r.person_id,
      r.related_id,
      r.type::text as type,
      r.metadata
    from public.relationships r
    inner join public.persons p1
      on p1.id = r.person_id
     and p1.tree_id = target_tree_id
    inner join public.persons p2
      on p2.id = r.related_id
     and p2.tree_id = target_tree_id
    where r.tree_id = target_tree_id
      and public.can_read_tree(target_tree_id)
      and r.type::text in ('bio_father', 'bio_mother', 'child')
      and (
        public.can_write_tree(target_tree_id)
        or (
          not coalesce(p1.is_private, false)
          and not coalesce(p2.is_private, false)
        )
      )
    order by r.created_at, r.id
  ) as path_rows;
$$;

revoke all on function public.load_dna_path_relationships(uuid) from public;
grant execute on function public.load_dna_path_relationships(uuid) to anon, authenticated;
