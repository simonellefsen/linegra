-- Include parent→child links when the parent is in pedigree scope but the child is not,
-- so the UI can show per-person descendant expand hints (e.g. Wilhelmina → E. G. Kazanis).

create or replace function public.load_pedigree_scope(
  target_tree_id uuid,
  focus_person_id uuid default null,
  max_ancestor_depth int default 2,
  max_descendant_depth int default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_focus uuid := focus_person_id;
  can_write boolean;
  ancestor_cap int := greatest(0, least(coalesce(max_ancestor_depth, 2), 8));
  descendant_cap int := greatest(0, least(coalesce(max_descendant_depth, 1), 4));
  parental_types text[] := array[
    'bio_father', 'bio_mother', 'adoptive_father', 'adoptive_mother', 'step_parent', 'guardian', 'child'
  ];
  persons_json jsonb := '[]'::jsonb;
  relationships_json jsonb := '[]'::jsonb;
  has_more_ancestors boolean := false;
  has_more_descendants boolean := false;
begin
  if not public.can_read_tree(target_tree_id) then
    raise exception 'Not authorized to read this tree';
  end if;

  can_write := public.can_write_tree(target_tree_id);

  if resolved_focus is null then
    select (ft.metadata->>'defaultProbandId')::uuid
      into resolved_focus
      from public.family_trees ft
     where ft.id = target_tree_id
       and coalesce(ft.metadata->>'defaultProbandId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if resolved_focus is null then
    select p.id
      into resolved_focus
      from public.persons p
     where p.tree_id = target_tree_id
       and (can_write or not coalesce(p.is_private, false))
     order by lower(p.last_name), lower(p.first_name), p.id
     limit 1;
  end if;

  if resolved_focus is null then
    return jsonb_build_object(
      'focus_person_id', null,
      'persons', '[]'::jsonb,
      'relationships', '[]'::jsonb,
      'has_more_ancestors', false,
      'has_more_descendants', false
    );
  end if;

  if not exists (
    select 1
      from public.persons p
     where p.id = resolved_focus
       and p.tree_id = target_tree_id
       and (can_write or not coalesce(p.is_private, false))
  ) then
    raise exception 'Focus person not found or not visible';
  end if;

  with recursive
  ancestors as (
    select resolved_focus as person_id, 0 as depth
    union
    select r.person_id, a.depth + 1
      from ancestors a
      join public.relationships r
        on r.related_id = a.person_id
       and r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
     where a.depth < ancestor_cap
  ),
  descendants as (
    select resolved_focus as person_id, 0 as depth
    union
    select r.related_id, d.depth + 1
      from descendants d
      join public.relationships r
        on r.person_id = d.person_id
       and r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
     where d.depth < descendant_cap
  ),
  scope_ids as (
    select person_id from ancestors
    union
    select person_id from descendants
  ),
  partner_ids as (
    select distinct
      case
        when r.person_id = s.person_id then r.related_id
        else r.person_id
      end as person_id
    from scope_ids s
    join public.relationships r
      on r.tree_id = target_tree_id
     and r.type in ('marriage', 'partner')
     and (r.person_id = s.person_id or r.related_id = s.person_id)
  ),
  coparent_ids as (
    select distinct r2.person_id
    from scope_ids s
    join public.relationships r1
      on r1.tree_id = target_tree_id
     and r1.type::text = any(parental_types)
     and r1.person_id = s.person_id
     and r1.related_id in (select person_id from scope_ids)
    join public.relationships r2
      on r2.tree_id = target_tree_id
     and r2.type::text = any(parental_types)
     and r2.related_id = r1.related_id
     and r2.person_id <> r1.person_id
  ),
  expanded_scope as (
    select person_id from scope_ids
    union
    select person_id from partner_ids
    union
    select person_id from coparent_ids
  )
  select coalesce(jsonb_agg(to_jsonb(person_rows)), '[]'::jsonb)
    into persons_json
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
        p.updated_at,
        p.metadata,
        p.is_living,
        p.is_private
      from public.persons p
      inner join expanded_scope s on s.person_id = p.id
      where p.tree_id = target_tree_id
        and (can_write or not coalesce(p.is_private, false))
      order by lower(p.last_name), lower(p.first_name), p.id
    ) as person_rows;

  with recursive
  ancestors as (
    select resolved_focus as person_id, 0 as depth
    union
    select r.person_id, a.depth + 1
      from ancestors a
      join public.relationships r
        on r.related_id = a.person_id
       and r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
     where a.depth < ancestor_cap
  ),
  descendants as (
    select resolved_focus as person_id, 0 as depth
    union
    select r.related_id, d.depth + 1
      from descendants d
      join public.relationships r
        on r.person_id = d.person_id
       and r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
     where d.depth < descendant_cap
  ),
  scope_ids as (
    select person_id from ancestors
    union
    select person_id from descendants
  ),
  partner_ids as (
    select distinct
      case
        when r.person_id = s.person_id then r.related_id
        else r.person_id
      end as person_id
    from scope_ids s
    join public.relationships r
      on r.tree_id = target_tree_id
     and r.type in ('marriage', 'partner')
     and (r.person_id = s.person_id or r.related_id = s.person_id)
  ),
  coparent_ids as (
    select distinct r2.person_id
    from scope_ids s
    join public.relationships r1
      on r1.tree_id = target_tree_id
     and r1.type::text = any(parental_types)
     and r1.person_id = s.person_id
     and r1.related_id in (select person_id from scope_ids)
    join public.relationships r2
      on r2.tree_id = target_tree_id
     and r2.type::text = any(parental_types)
     and r2.related_id = r1.related_id
     and r2.person_id <> r1.person_id
  ),
  expanded_scope as (
    select person_id from scope_ids
    union
    select person_id from partner_ids
    union
    select person_id from coparent_ids
  )
  select coalesce(jsonb_agg(to_jsonb(rel_rows)), '[]'::jsonb)
    into relationships_json
    from (
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
      inner join expanded_scope s1 on s1.person_id = r.person_id
      inner join expanded_scope s2 on s2.person_id = r.related_id
      where r.tree_id = target_tree_id
      union
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
      inner join expanded_scope s on s.person_id = r.person_id
      where r.tree_id = target_tree_id
        and r.type::text = any(parental_types)
        and not exists (
          select 1
            from expanded_scope o
           where o.person_id = r.related_id
        )
      order by created_at, id
    ) as rel_rows;

  select exists (
    select 1
      from public.relationships r
     where r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
       and r.related_id in (
         select a.person_id
           from (
             with recursive anc as (
               select resolved_focus as person_id, 0 as depth
               union
               select rel.person_id, anc.depth + 1
                 from anc
                 join public.relationships rel
                   on rel.related_id = anc.person_id
                  and rel.tree_id = target_tree_id
                  and rel.type::text = any(parental_types)
                where anc.depth < ancestor_cap
             )
             select person_id, depth from anc
           ) a
          where a.depth = ancestor_cap
       )
       and exists (
         select 1
           from public.persons p
          where p.id = r.person_id
            and p.tree_id = target_tree_id
            and (can_write or not coalesce(p.is_private, false))
       )
  ) into has_more_ancestors;

  select exists (
    select 1
      from public.relationships r
     where r.tree_id = target_tree_id
       and r.type::text = any(parental_types)
       and r.person_id in (
         select d.person_id
           from (
             with recursive des as (
               select resolved_focus as person_id, 0 as depth
               union
               select rel.related_id, des.depth + 1
                 from des
                 join public.relationships rel
                   on rel.person_id = des.person_id
                  and rel.tree_id = target_tree_id
                  and rel.type::text = any(parental_types)
                where des.depth < descendant_cap
             )
             select person_id, depth from des
           ) d
          where d.depth = descendant_cap
       )
       and exists (
         select 1
           from public.persons p
          where p.id = r.related_id
            and p.tree_id = target_tree_id
            and (can_write or not coalesce(p.is_private, false))
       )
  ) into has_more_descendants;

  return jsonb_build_object(
    'focus_person_id', resolved_focus,
    'persons', persons_json,
    'relationships', relationships_json,
    'has_more_ancestors', has_more_ancestors,
    'has_more_descendants', has_more_descendants
  );
end;
$$;
