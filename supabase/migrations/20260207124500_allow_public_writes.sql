-- Temporarily allow writes to public trees for anon/publishable-key clients until full Supabase auth is wired up.

create or replace function public.can_write_tree(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_trees ft
    where ft.id = target_tree_id
      and (
        ft.is_public
        or (
          auth.uid() is not null
          and (
            ft.owner_id = auth.uid()
            or exists (
              select 1 from public.tree_collaborators tc
              where tc.tree_id = ft.id
                and tc.profile_id = auth.uid()
                and tc.status = 'active'
                and tc.role in ('owner','editor')
            )
          )
        )
      )
  );
$$;
