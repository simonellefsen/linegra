create or replace function public.admin_list_tree_shared_autosomal_tests(target_tree_id uuid)
returns table (
  test_id uuid,
  owner_person_id uuid,
  owner_first_name text,
  owner_last_name text,
  counterpart_person_id uuid,
  counterpart_first_name text,
  counterpart_last_name text,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    dt.id as test_id,
    owner_person.id as owner_person_id,
    owner_person.first_name as owner_first_name,
    owner_person.last_name as owner_last_name,
    counterpart.id as counterpart_person_id,
    counterpart.first_name as counterpart_first_name,
    counterpart.last_name as counterpart_last_name,
    dt.metadata
  from public.dna_tests dt
  join public.persons owner_person
    on owner_person.id = dt.person_id
  left join public.persons counterpart
    on counterpart.id = (
      case
        when coalesce(dt.metadata->>'sharedMatchPersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (dt.metadata->>'sharedMatchPersonId')::uuid
        else null
      end
    )
   and counterpart.tree_id = target_tree_id
  where owner_person.tree_id = target_tree_id
    and dt.test_type = 'Shared Autosomal'::public.dna_test_type
  order by dt.created_at desc;
$$;

grant execute on function public.admin_list_tree_shared_autosomal_tests(uuid) to anon, authenticated;
