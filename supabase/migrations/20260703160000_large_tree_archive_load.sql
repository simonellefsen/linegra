-- Fast paginated archive reads for large trees (10k+ persons).
-- PostgREST selects under per-row RLS on relationships were hitting statement timeouts.

create or replace function public.load_tree_archive_persons_page(
  target_tree_id uuid,
  page_limit int default 1000,
  page_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(page_rows)),
    '[]'::jsonb
  )
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
    where p.tree_id = target_tree_id
      and public.can_read_tree(target_tree_id)
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(p.is_private, false)
      )
    order by lower(p.last_name), lower(p.first_name), p.id
    limit greatest(1, least(coalesce(page_limit, 1000), 2000))
    offset greatest(0, coalesce(page_offset, 0))
  ) as page_rows;
$$;

create or replace function public.load_tree_archive_relationships_page(
  target_tree_id uuid,
  page_limit int default 1000,
  page_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(page_rows)),
    '[]'::jsonb
  )
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
    inner join public.persons p1
      on p1.id = r.person_id
     and p1.tree_id = target_tree_id
    inner join public.persons p2
      on p2.id = r.related_id
     and p2.tree_id = target_tree_id
    where r.tree_id = target_tree_id
      and public.can_read_tree(target_tree_id)
      and (
        public.can_write_tree(target_tree_id)
        or (
          not coalesce(p1.is_private, false)
          and not coalesce(p2.is_private, false)
        )
      )
    order by r.created_at, r.id
    limit greatest(1, least(coalesce(page_limit, 1000), 2000))
    offset greatest(0, coalesce(page_offset, 0))
  ) as page_rows;
$$;

revoke all on function public.load_tree_archive_persons_page(uuid, int, int) from public;
revoke all on function public.load_tree_archive_relationships_page(uuid, int, int) from public;

grant execute on function public.load_tree_archive_persons_page(uuid, int, int) to anon, authenticated;
grant execute on function public.load_tree_archive_relationships_page(uuid, int, int) to anon, authenticated;

create index if not exists relationships_tree_created_idx
  on public.relationships (tree_id, created_at, id);
