-- Roadmap U16 — semantic public URL slugs + resolve helpers.

alter table public.family_trees
  add column if not exists slug text;

update public.family_trees
set slug = trim(both '-' from regexp_replace(lower(coalesce(name, 'tree')), '[^a-z0-9]+', '-', 'g'))
where slug is null or btrim(slug) = '';

create unique index if not exists family_trees_slug_unique
  on public.family_trees (lower(slug))
  where slug is not null and btrim(slug) <> '';

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

  select ft.id into resolved
  from public.family_trees ft
  where lower(ft.slug) = lower(segment) and ft.is_public
  limit 1;

  return resolved;
end;
$$;

create or replace function public.resolve_public_person_id(
  target_tree_id uuid,
  id_prefix text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved uuid;
  normalized_prefix text := lower(regexp_replace(coalesce(id_prefix, ''), '[^0-9a-f]', '', 'g'));
begin
  if target_tree_id is null or normalized_prefix = '' then
    return null;
  end if;

  if normalized_prefix ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into resolved
    from public.persons p
    inner join public.family_trees ft on ft.id = p.tree_id and ft.is_public
    where p.tree_id = target_tree_id
      and p.id = normalized_prefix::uuid
      and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text);
    return resolved;
  end if;

  select p.id into resolved
  from public.persons p
  where p.tree_id = target_tree_id
    and lower(replace(p.id::text, '-', '')) like normalized_prefix || '%'
    and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
  order by length(replace(p.id::text, '-', ''))
  limit 1;

  return resolved;
end;
$$;

create or replace function public.list_public_trees_directory()
returns table (
  tree_id uuid,
  tree_name text,
  tree_slug text,
  description text,
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
    ft.name,
    ft.slug,
    ft.description,
    count(p.id) filter (
      where public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
    ) as person_count,
    ft.updated_at
  from public.family_trees ft
  left join public.persons p on p.tree_id = ft.id
  where ft.is_public
  group by ft.id, ft.name, ft.slug, ft.description, ft.updated_at
  order by lower(ft.name);
$$;

revoke all on function public.resolve_public_tree_id(text) from public;
revoke all on function public.resolve_public_person_id(uuid, text) from public;
revoke all on function public.list_public_trees_directory() from public;

grant execute on function public.resolve_public_tree_id(text) to anon, authenticated;
grant execute on function public.resolve_public_person_id(uuid, text) to anon, authenticated;
grant execute on function public.list_public_trees_directory() to anon, authenticated;

-- Expose slug on authenticated tree listings.
drop function if exists public.admin_list_trees_with_counts();

create or replace function public.admin_list_trees_with_counts()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  slug text,
  description text,
  theme_color text,
  metadata jsonb,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  person_count bigint,
  relationship_count bigint,
  my_role text
)
language sql
security definer
set search_path = public
as $$
  select
    ft.id,
    ft.owner_id,
    ft.name,
    ft.slug,
    ft.description,
    ft.theme_color,
    ft.metadata,
    ft.is_public,
    ft.created_at,
    ft.updated_at,
    ft.archived_at,
    coalesce(p_count.person_count, 0) as person_count,
    coalesce(r_count.relationship_count, 0) as relationship_count,
    public.get_my_tree_role(ft.id) as my_role
  from public.family_trees ft
  left join (
    select tree_id, count(*) as person_count
    from public.persons
    group by tree_id
  ) p_count on p_count.tree_id = ft.id
  left join (
    select tree_id, count(*) as relationship_count
    from public.relationships
    group by tree_id
  ) r_count on r_count.tree_id = ft.id
  where public.can_read_tree(ft.id)
  order by lower(ft.name);
$$;

grant execute on function public.admin_list_trees_with_counts() to authenticated;

select pg_notify('pgrst', 'reload schema');
