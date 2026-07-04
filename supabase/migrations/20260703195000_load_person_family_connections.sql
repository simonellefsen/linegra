-- Load direct family connections for the profile Family tab without PostgREST row limits
-- or relationship RLS gaps when a spouse/child is private.

create or replace function public.load_person_family_connections(
  target_tree_id uuid,
  target_person_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  can_write boolean := false;
  relationships_json jsonb := '[]'::jsonb;
  persons_json jsonb := '[]'::jsonb;
  parental_types text[] := array[
    'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian'
  ];
begin
  if not public.can_read_tree(target_tree_id) then
    raise exception 'Not allowed to read this tree';
  end if;

  if not exists (
    select 1
    from public.persons p
    where p.id = target_person_id
      and p.tree_id = target_tree_id
  ) then
    raise exception 'Person not found in this tree';
  end if;

  can_write := public.can_write_tree(target_tree_id);

  with direct as (
    select
      r.id,
      r.tree_id,
      r.person_id,
      r.related_id,
      r.type,
      r.status,
      r.confidence,
      r.notes,
      r.sort_order,
      r.metadata,
      r.created_at
    from public.relationships r
    where r.tree_id = target_tree_id
      and (r.person_id = target_person_id or r.related_id = target_person_id)
  ),
  parent_ids as (
    select distinct d.person_id as parent_person_id
    from direct d
    where d.type::text = any(parental_types)
      and d.related_id = target_person_id
  ),
  sibling_rels as (
    select
      r.id,
      r.tree_id,
      r.person_id,
      r.related_id,
      r.type,
      r.status,
      r.confidence,
      r.notes,
      r.sort_order,
      r.metadata,
      r.created_at
    from public.relationships r
    inner join parent_ids p on p.parent_person_id = r.person_id
    where r.tree_id = target_tree_id
      and r.type::text = any(parental_types)
      and r.related_id <> target_person_id
  ),
  all_rels as (
    select * from direct
    union
    select * from sibling_rels
  ),
  visible_rels as (
    select ar.*
    from all_rels ar
    where can_write
      or (
        exists (
          select 1
          from public.persons p
          where p.id = ar.person_id
            and p.tree_id = target_tree_id
            and not coalesce(p.is_private, false)
        )
        and exists (
          select 1
          from public.persons p
          where p.id = ar.related_id
            and p.tree_id = target_tree_id
            and not coalesce(p.is_private, false)
        )
      )
  ),
  rel_people as (
    select distinct vr.person_id as id
    from visible_rels vr
    union
    select distinct vr.related_id
    from visible_rels vr
    union
    select target_person_id
  )
  select
    coalesce((select jsonb_agg(to_jsonb(vr) order by vr.created_at, vr.id) from visible_rels vr), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(person_rows) order by lower(person_rows.last_name), lower(person_rows.first_name))
      from (
        select
          p.id,
          p.tree_id,
          p.first_name,
          p.last_name,
          p.maiden_name,
          p.gender,
          p.birth_date_text,
          p.death_date_text,
          p.birth_place_text,
          p.death_place_text,
          p.photo_url,
          p.metadata,
          p.updated_at,
          p.is_living,
          p.is_private
        from public.persons p
        inner join rel_people rp on rp.id = p.id
        where p.tree_id = target_tree_id
          and (
            can_write
            or not coalesce(p.is_private, false)
            or p.id = target_person_id
          )
      ) as person_rows
    ), '[]'::jsonb)
  into relationships_json, persons_json;

  return jsonb_build_object(
    'relationships', relationships_json,
    'people', persons_json
  );
end;
$$;

revoke all on function public.load_person_family_connections(uuid, uuid) from public;
grant execute on function public.load_person_family_connections(uuid, uuid) to anon, authenticated;
