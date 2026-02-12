update public.dna_tests dt
set
  shared_person_id = coalesce(
    dt.shared_person_id,
    case
      when coalesce(dt.metadata->>'sharedPersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (dt.metadata->>'sharedPersonId')::uuid
      when coalesce(dt.metadata->>'shared_person_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (dt.metadata->>'shared_person_id')::uuid
      else null
    end
  ),
  shared_match_person_id = coalesce(
    dt.shared_match_person_id,
    case
      when coalesce(dt.metadata->>'sharedMatchPersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (dt.metadata->>'sharedMatchPersonId')::uuid
      when coalesce(dt.metadata->>'shared_match_person_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (dt.metadata->>'shared_match_person_id')::uuid
      else null
    end
  )
where dt.test_type = 'Shared Autosomal'::public.dna_test_type;

drop function if exists public.admin_list_tree_shared_autosomal_tests(uuid);

create function public.admin_list_tree_shared_autosomal_tests(target_tree_id uuid)
returns table (
  test_id uuid,
  owner_person_id uuid,
  owner_first_name text,
  owner_last_name text,
  shared_person_id uuid,
  shared_match_person_id uuid,
  counterpart_person_id uuid,
  counterpart_first_name text,
  counterpart_last_name text,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select
      dt.id,
      dt.person_id,
      coalesce(
        dt.shared_person_id,
        case
          when coalesce(dt.metadata->>'sharedPersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dt.metadata->>'sharedPersonId')::uuid
          when coalesce(dt.metadata->>'shared_person_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dt.metadata->>'shared_person_id')::uuid
          else null
        end
      ) as resolved_shared_person_id,
      coalesce(
        dt.shared_match_person_id,
        case
          when coalesce(dt.metadata->>'sharedMatchPersonId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dt.metadata->>'sharedMatchPersonId')::uuid
          when coalesce(dt.metadata->>'shared_match_person_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dt.metadata->>'shared_match_person_id')::uuid
          else null
        end
      ) as resolved_shared_match_person_id,
      dt.metadata,
      dt.created_at
    from public.dna_tests dt
    where dt.test_type = 'Shared Autosomal'::public.dna_test_type
  )
  select
    n.id as test_id,
    owner_person.id as owner_person_id,
    owner_person.first_name as owner_first_name,
    owner_person.last_name as owner_last_name,
    n.resolved_shared_person_id as shared_person_id,
    n.resolved_shared_match_person_id as shared_match_person_id,
    counterpart.id as counterpart_person_id,
    counterpart.first_name as counterpart_first_name,
    counterpart.last_name as counterpart_last_name,
    n.metadata
  from normalized n
  join public.persons owner_person
    on owner_person.id = n.person_id
  left join public.persons counterpart
    on counterpart.id = n.resolved_shared_match_person_id
   and counterpart.tree_id = target_tree_id
  where owner_person.tree_id = target_tree_id
  order by n.created_at desc;
$$;

grant execute on function public.admin_list_tree_shared_autosomal_tests(uuid) to anon, authenticated;
