-- K10: surface all in-tree raw Autosomal kits for family-kit discovery.
-- Relationship labels and distance filtering are computed in app code (relationshipCalculator).

create or replace function public.list_family_autosomal_kits(
  target_tree_id uuid,
  focus_person_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(kit_rows)), '[]'::jsonb)
  from (
    select
      dt.id as test_id,
      p.id as owner_person_id,
      p.first_name as owner_first_name,
      p.last_name as owner_last_name,
      dt.metadata,
      dt.created_at
    from public.dna_tests dt
    inner join public.persons p
      on p.id = dt.person_id
     and p.tree_id = target_tree_id
    where dt.test_type = 'Autosomal'::public.dna_test_type
      and public.can_read_tree(target_tree_id)
      and p.id <> focus_person_id
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(p.is_private, false)
      )
    order by lower(p.last_name), lower(p.first_name), dt.created_at desc
  ) as kit_rows;
$$;

revoke all on function public.list_family_autosomal_kits(uuid, uuid) from public;
grant execute on function public.list_family_autosomal_kits(uuid, uuid) to anon, authenticated;
