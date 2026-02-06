-- Ensure owner_id can be null so we can bootstrap a shared tree
alter table public.family_trees
  alter column owner_id drop not null;

-- Ensure a default public tree exists and anon clients can write to it
do $$
declare
  default_owner uuid;
begin
  select id into default_owner from public.profiles limit 1;
  if not exists (select 1 from public.family_trees) then
    insert into public.family_trees (owner_id, name, description, is_public, theme_color)
    values (default_owner, 'Linegra Family Archive', 'Default archive seeded via migration', true, '#0f172a');
  end if;
end $$;

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
        (
          auth.uid() is not null
          and (
            ft.owner_id = auth.uid()
            or exists (
              select 1
              from public.tree_collaborators tc
              where tc.tree_id = ft.id
                and tc.profile_id = auth.uid()
                and tc.status = 'active'
                and tc.role in ('owner', 'editor')
            )
          )
        )
        or (ft.is_public and auth.role() = 'anon')
      )
  );
$$;
