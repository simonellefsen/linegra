-- Tighten media link RLS policies to tree-scoped read/write access.

drop policy if exists "media_event_link" on public.media_event_links;
drop policy if exists "media_event_link_write" on public.media_event_links;

create policy "media_event_link_select"
on public.media_event_links
for select
using (
  exists (
    select 1
    from public.person_events pe
    join public.persons p on p.id = pe.person_id
    join public.media_items mi on mi.id = media_event_links.media_id
    where pe.id = media_event_links.person_event_id
      and mi.tree_id = p.tree_id
      and public.can_read_tree(p.tree_id)
  )
);

create policy "media_event_link_write"
on public.media_event_links
for all
using (
  exists (
    select 1
    from public.person_events pe
    join public.persons p on p.id = pe.person_id
    join public.media_items mi on mi.id = media_event_links.media_id
    where pe.id = media_event_links.person_event_id
      and mi.tree_id = p.tree_id
      and public.can_write_tree(p.tree_id)
  )
)
with check (
  exists (
    select 1
    from public.person_events pe
    join public.persons p on p.id = pe.person_id
    join public.media_items mi on mi.id = media_event_links.media_id
    where pe.id = media_event_links.person_event_id
      and mi.tree_id = p.tree_id
      and public.can_write_tree(p.tree_id)
  )
);

drop policy if exists "media_relationship_link" on public.media_relationship_links;
drop policy if exists "media_relationship_link_write" on public.media_relationship_links;

create policy "media_relationship_link_select"
on public.media_relationship_links
for select
using (
  exists (
    select 1
    from public.relationships r
    join public.media_items mi on mi.id = media_relationship_links.media_id
    where r.id = media_relationship_links.relationship_id
      and mi.tree_id = r.tree_id
      and public.can_read_tree(r.tree_id)
  )
);

create policy "media_relationship_link_write"
on public.media_relationship_links
for all
using (
  exists (
    select 1
    from public.relationships r
    join public.media_items mi on mi.id = media_relationship_links.media_id
    where r.id = media_relationship_links.relationship_id
      and mi.tree_id = r.tree_id
      and public.can_write_tree(r.tree_id)
  )
)
with check (
  exists (
    select 1
    from public.relationships r
    join public.media_items mi on mi.id = media_relationship_links.media_id
    where r.id = media_relationship_links.relationship_id
      and mi.tree_id = r.tree_id
      and public.can_write_tree(r.tree_id)
  )
);
