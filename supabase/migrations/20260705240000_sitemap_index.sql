-- Roadmap U3 — sitemap-index chunking (per-tree person sitemaps + core chunk).

create or replace function public.resolve_public_tree_id(segment text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved uuid;
begin
  if segment is null or btrim(segment) = '' then
    return null;
  end if;

  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ft.id into resolved
    from public.family_trees ft
    where ft.id = segment::uuid and ft.is_public;
    return resolved;
  end if;

  if segment ~ '^[0-9a-f]{8,12}$' then
    select ft.id into resolved
    from public.family_trees ft
    where ft.is_public
      and replace(ft.id::text, '-', '') like lower(segment) || '%'
    order by ft.updated_at desc
    limit 1;
    return resolved;
  end if;

  select ft.id into resolved
  from public.family_trees ft
  where lower(ft.slug) = lower(segment) and ft.is_public
  limit 1;

  return resolved;
end;
$$;

create or replace function public.list_public_sitemap_tree_counts()
returns table (
  tree_id uuid,
  person_count bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ft.id,
    count(p.id)::bigint as person_count,
    max(greatest(ft.updated_at, p.updated_at)) as updated_at
  from public.family_trees ft
  left join public.persons p
    on p.tree_id = ft.id
    and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
  where ft.is_public
  group by ft.id
  order by ft.id;
$$;

create or replace function public.list_public_sitemap_core_entries()
returns table (
  kind text,
  tree_id uuid,
  book_id uuid,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'tree'::text,
    ft.id,
    null::uuid,
    ft.updated_at
  from public.family_trees ft
  where ft.is_public
  union all
  select
    'book'::text,
    b.tree_id,
    b.id,
    b.updated_at
  from public.family_books b
  inner join public.family_trees ft on ft.id = b.tree_id and ft.is_public
  where b.is_public and b.status = 'complete'
  order by updated_at desc nulls last;
$$;

create or replace function public.list_public_sitemap_persons_for_tree(target_tree_id uuid)
returns table (
  person_id uuid,
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
  select p.id, p.updated_at
  from public.persons p
  where p.tree_id = target_tree_id
    and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
  order by lower(p.last_name), lower(p.first_name), p.id;
end;
$$;

revoke all on function public.list_public_sitemap_tree_counts() from public;
revoke all on function public.list_public_sitemap_core_entries() from public;
revoke all on function public.list_public_sitemap_persons_for_tree(uuid) from public;

grant execute on function public.list_public_sitemap_tree_counts() to anon, authenticated;
grant execute on function public.list_public_sitemap_core_entries() to anon, authenticated;
grant execute on function public.list_public_sitemap_persons_for_tree(uuid) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
