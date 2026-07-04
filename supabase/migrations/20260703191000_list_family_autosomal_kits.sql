-- List in-tree relatives with raw Autosomal kits linked to the focus person via documented family edges.

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
      case r.type::text
        when 'bio_mother' then 'Biological mother'
        when 'bio_father' then 'Biological father'
        when 'adoptive_mother' then 'Adoptive mother'
        when 'adoptive_father' then 'Adoptive father'
        when 'step_parent' then 'Step-parent'
        when 'guardian' then 'Guardian'
        when 'child' then 'Child'
        else 'Family member'
      end as relation_label
    from public.relationships r
    join public.persons relative_person
      on relative_person.id = case
        when r.type::text in (
          'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'
        ) and r.related_id = focus_person_id then r.person_id
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

revoke all on function public.list_family_autosomal_kits(uuid, uuid) from public;
grant execute on function public.list_family_autosomal_kits(uuid, uuid) to anon, authenticated;
