-- Roadmap U3/U5 — public crawl indexes (sitemap + tree person lists).

create or replace function public.is_person_publicly_crawlable(
  p_is_private boolean,
  p_is_living boolean,
  p_death_date_text text
)
returns boolean
language sql
stable
as $$
  select
    not coalesce(p_is_private, false)
    and (
      p_death_date_text is not null
      or coalesce(p_is_living, false) = false
    );
$$;

create or replace function public.list_public_tree_crawl_persons(
  target_tree_id uuid,
  row_limit int default 500,
  row_offset int default 0
)
returns table (
  person_id uuid,
  display_name text,
  birth_date_text text,
  death_date_text text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.family_trees ft
    where ft.id = target_tree_id and ft.is_public
  ) then
    return;
  end if;

  return query
  select
    p.id,
    trim(concat_ws(' ', nullif(p.title, ''), p.first_name, p.last_name)) as display_name,
    p.birth_date_text,
    p.death_date_text,
    p.updated_at
  from public.persons p
  where p.tree_id = target_tree_id
    and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
  order by lower(p.last_name), lower(p.first_name), p.id
  limit greatest(row_limit, 1)
  offset greatest(row_offset, 0);
end;
$$;

create or replace function public.list_public_sitemap_entries(entry_limit int default 10000)
returns table (
  kind text,
  tree_id uuid,
  person_id uuid,
  book_id uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  (
    select
      'tree'::text as kind,
      ft.id as tree_id,
      null::uuid as person_id,
      null::uuid as book_id,
      ft.updated_at
    from public.family_trees ft
    where ft.is_public
  )
  union all
  (
    select
      'person'::text as kind,
      p.tree_id,
      p.id,
      null::uuid,
      p.updated_at
    from public.persons p
    inner join public.family_trees ft on ft.id = p.tree_id and ft.is_public
    where public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
  )
  union all
  (
    select
      'book'::text as kind,
      b.tree_id,
      null::uuid,
      b.id,
      b.updated_at
    from public.family_books b
    inner join public.family_trees ft on ft.id = b.tree_id and ft.is_public
    where b.is_public and b.status = 'complete'
  )
  order by updated_at desc nulls last
  limit greatest(entry_limit, 1);
end;
$$;

revoke all on function public.is_person_publicly_crawlable(boolean, boolean, text) from public;
revoke all on function public.list_public_tree_crawl_persons(uuid, int, int) from public;
revoke all on function public.list_public_sitemap_entries(int) from public;

grant execute on function public.is_person_publicly_crawlable(boolean, boolean, text) to anon, authenticated;
grant execute on function public.list_public_tree_crawl_persons(uuid, int, int) to anon, authenticated;
grant execute on function public.list_public_sitemap_entries(int) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
