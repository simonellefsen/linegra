-- Rename Gøth → Gøth-Tunsted (display name + public URL slug).

update public.family_trees
set
  name = 'Gøth-Tunsted',
  slug = 'goeth-tunsted',
  updated_at = now()
where lower(name) = lower('Gøth');

select pg_notify('pgrst', 'reload schema');
