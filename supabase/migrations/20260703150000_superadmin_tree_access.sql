-- Superadmin tree access: restore admin visibility for private persons and writes
-- on readable trees after multi-user auth removed anonymous/public write bypass.

create or replace function public.can_read_tree(target_tree_id uuid)
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
        or public.is_superadmin()
        or (
          auth.uid() is not null
          and (
            ft.owner_id = auth.uid()
            or exists (
              select 1 from public.tree_collaborators tc
              where tc.tree_id = ft.id and tc.profile_id = auth.uid() and tc.status = 'active'
            )
          )
        )
      )
  );
$$;

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
      and auth.uid() is not null
      and (
        public.is_superadmin()
        or ft.owner_id = auth.uid()
        or exists (
          select 1 from public.tree_collaborators tc
          where tc.tree_id = ft.id
            and tc.profile_id = auth.uid()
            and tc.status = 'active'
            and tc.role in ('owner', 'editor')
        )
      )
  );
$$;
