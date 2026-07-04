-- DNA match linking fixes:
-- 1) Family kits: include children when focus person is the parent on a parent-type edge.
-- 2) Shared autosomal listing: return all in-tree shared tests (client resolves focus counterpart).

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
  with family_links as (
    select
      relative_person.id as relative_person_id,
      relative_person.first_name as relative_first_name,
      relative_person.last_name as relative_last_name,
      r.id as relationship_id,
      r.type::text as relationship_type,
      case
        when r.type::text = 'bio_mother' and r.related_id = focus_person_id then 'Biological mother'
        when r.type::text = 'bio_mother' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'bio_father' and r.related_id = focus_person_id then 'Biological father'
        when r.type::text = 'bio_father' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'adoptive_mother' and r.related_id = focus_person_id then 'Adoptive mother'
        when r.type::text = 'adoptive_mother' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'adoptive_father' and r.related_id = focus_person_id then 'Adoptive father'
        when r.type::text = 'adoptive_father' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'step_parent' and r.related_id = focus_person_id then 'Step-parent'
        when r.type::text = 'step_parent' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'guardian' and r.related_id = focus_person_id then 'Guardian'
        when r.type::text = 'guardian' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'child' and r.person_id = focus_person_id then 'Child'
        when r.type::text = 'child' and r.related_id = focus_person_id then 'Parent'
        else 'Family member'
      end as relation_label
    from public.relationships r
    join public.persons relative_person
      on relative_person.id = case
        when r.type::text in (
          'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'
        ) and r.related_id = focus_person_id then r.person_id
        when r.type::text in (
          'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'
        ) and r.person_id = focus_person_id then r.related_id
        when r.type::text = 'child' and r.person_id = focus_person_id then r.related_id
        when r.type::text = 'child' and r.related_id = focus_person_id then r.person_id
        else null
      end
    where r.tree_id = target_tree_id
      and public.can_read_tree(target_tree_id)
      and relative_person.tree_id = target_tree_id
      and relative_person.id is not null
      and relative_person.id <> focus_person_id
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(relative_person.is_private, false)
      )
  ),
  kits as (
    select
      dt.id as test_id,
      fl.relative_person_id as owner_person_id,
      fl.relative_first_name as owner_first_name,
      fl.relative_last_name as owner_last_name,
      fl.relationship_id,
      fl.relationship_type,
      fl.relation_label,
      dt.metadata,
      dt.created_at
    from family_links fl
    join public.dna_tests dt
      on dt.person_id = fl.relative_person_id
     and dt.test_type = 'Autosomal'::public.dna_test_type
    order by fl.relation_label, dt.created_at desc
  )
  select coalesce(jsonb_agg(to_jsonb(kits)), '[]'::jsonb)
  from kits;
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
        public.can_write_tree(target_tree_id)
        or not coalesce(owner_person.is_private, false)
      )
    order by n.created_at desc
  )
  select coalesce(jsonb_agg(to_jsonb(scoped)), '[]'::jsonb)
  from scoped;
$$;

revoke all on function public.list_family_autosomal_kits(uuid, uuid) from public;
grant execute on function public.list_family_autosomal_kits(uuid, uuid) to anon, authenticated;
