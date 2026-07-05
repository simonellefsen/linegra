-- Public family-book crawl resolution (slug id8 → uuid).

create or replace function public.resolve_public_book_id(id_prefix text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.family_books b
  inner join public.family_trees ft on ft.id = b.tree_id and ft.is_public
  where b.is_public
    and b.status = 'complete'
    and replace(b.id::text, '-', '') like lower(trim(coalesce(id_prefix, ''))) || '%'
  order by b.updated_at desc
  limit 1;
$$;

revoke all on function public.resolve_public_book_id(text) from public;
grant execute on function public.resolve_public_book_id(text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
