-- Enforce single parent figures per child for key relationship types

with duplicates as (
  select
    id,
    row_number() over (
      partition by related_id, type
      order by created_at, id
    ) as rn
  from public.relationships
  where type in ('bio_father','bio_mother','adoptive_father','adoptive_mother')
)
delete from public.relationships
where id in (select id from duplicates where rn > 1);

create unique index if not exists relationships_unique_bio_father
  on public.relationships(related_id)
  where type = 'bio_father';

create unique index if not exists relationships_unique_bio_mother
  on public.relationships(related_id)
  where type = 'bio_mother';

create unique index if not exists relationships_unique_adoptive_father
  on public.relationships(related_id)
  where type = 'adoptive_father';

create unique index if not exists relationships_unique_adoptive_mother
  on public.relationships(related_id)
  where type = 'adoptive_mother';
