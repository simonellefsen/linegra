-- DNA admin performance: path-relationship graph + focus-scoped shared tests.

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
      and r.type::text in (
        'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother',
        'guardian', 'step_parent', 'child', 'marriage', 'partner'
      )
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

create or replace function public.list_focus_shared_autosomal_tests(
  target_tree_id uuid,
  focus_person_id uuid
)
returns jsonb
language sql
stable
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
  ),
  scoped as (
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
      and public.can_read_tree(target_tree_id)
      and (
        n.person_id = focus_person_id
        or n.resolved_shared_person_id = focus_person_id
        or n.resolved_shared_match_person_id = focus_person_id
      )
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(owner_person.is_private, false)
      )
    order by n.created_at desc
  )
  select coalesce(jsonb_agg(to_jsonb(scoped)), '[]'::jsonb)
  from scoped;
$$;

revoke all on function public.load_dna_path_relationships(uuid) from public;
revoke all on function public.list_focus_shared_autosomal_tests(uuid, uuid) from public;

grant execute on function public.load_dna_path_relationships(uuid) to anon, authenticated;
grant execute on function public.list_focus_shared_autosomal_tests(uuid, uuid) to anon, authenticated;
