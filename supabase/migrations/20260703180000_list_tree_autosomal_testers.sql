-- Fast autosomal-tester listing for large trees (avoid scanning all persons).

create index if not exists dna_tests_type_person_idx
  on public.dna_tests (test_type, person_id);

create or replace function public.list_tree_autosomal_testers(target_tree_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(tester_rows)), '[]'::jsonb)
  from (
    select
      p.id as person_id,
      p.first_name,
      p.last_name,
      p.birth_date_text,
      p.death_date_text,
      count(dt.id)::int as autosomal_test_count
    from public.dna_tests dt
    inner join public.persons p
      on p.id = dt.person_id
     and p.tree_id = target_tree_id
    where dt.test_type = 'Autosomal'::public.dna_test_type
      and public.can_read_tree(target_tree_id)
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(p.is_private, false)
      )
    group by p.id, p.first_name, p.last_name, p.birth_date_text, p.death_date_text
    order by lower(p.last_name), lower(p.first_name), p.id
  ) as tester_rows;
$$;

revoke all on function public.list_tree_autosomal_testers(uuid) from public;
grant execute on function public.list_tree_autosomal_testers(uuid) to anon, authenticated;
