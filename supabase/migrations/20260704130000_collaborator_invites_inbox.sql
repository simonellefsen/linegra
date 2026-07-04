-- Roadmap A: collaborator-facing pending invite inbox (list + accept RPC already exists).

create or replace function public.list_my_pending_collaborator_invites()
returns table (
  id uuid,
  tree_id uuid,
  tree_name text,
  role text,
  invitation_email text,
  invited_at timestamptz,
  owner_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
begin
  if auth.uid() is null then
    return;
  end if;

  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    return;
  end if;

  return query
  select
    tc.id,
    tc.tree_id,
    ft.name as tree_name,
    tc.role,
    tc.invitation_email,
    tc.invited_at,
    coalesce(op.display_name, op.full_name, split_part(ou.email, '@', 1)) as owner_display_name
  from public.tree_collaborators tc
  join public.family_trees ft on ft.id = tc.tree_id
  left join public.profiles op on op.id = ft.owner_id
  left join auth.users ou on ou.id = ft.owner_id
  where tc.status = 'invited'
    and tc.profile_id is null
    and tc.invitation_email is not null
    and lower(tc.invitation_email) = lower(user_email)
  order by tc.invited_at desc;
end;
$$;

revoke all on function public.list_my_pending_collaborator_invites() from public, anon;
grant execute on function public.list_my_pending_collaborator_invites() to authenticated;

select pg_notify('pgrst', 'reload schema');
