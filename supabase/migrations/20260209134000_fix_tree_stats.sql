-- Fix ambiguous avg_age reference in tree_statistics helper

create or replace function public.tree_statistics(target_tree_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total_people int := 0;
  male_count int := 0;
  female_count int := 0;
  unknown_gender_count int := 0;
  living_count int := 0;
  deceased_count int := 0;
  marriage_count int := 0;
  avg_lifespan_all numeric;
  avg_age16 numeric;
  oldest_row record;
  most_children_row record;
  most_marriages_row record;
  century_json jsonb := '[]'::jsonb;
begin
  select count(*)
    into total_people
    from public.persons
   where tree_id = target_tree_id;

  select count(*) filter (where gender = 'M'),
         count(*) filter (where gender = 'F'),
         count(*) filter (where gender not in ('M','F') or gender is null)
    into male_count, female_count, unknown_gender_count
    from public.persons
   where tree_id = target_tree_id;

  select count(*) filter (where coalesce(is_living, death_date_text is null)),
         count(*) filter (where not coalesce(is_living, death_date_text is null))
    into living_count, deceased_count
    from public.persons
   where tree_id = target_tree_id;

  select count(*)
    into marriage_count
    from public.relationships
   where tree_id = target_tree_id
     and type = 'marriage';

  with person_years as (
    select
      id,
      tree_id,
      first_name,
      last_name,
      coalesce((regexp_match(birth_date_text, '(\d{4})'))[1], null)::int as birth_year,
      coalesce((regexp_match(death_date_text, '(\d{4})'))[1], null)::int as death_year
    from public.persons
    where tree_id = target_tree_id
  ),
  spans as (
    select birth_year, death_year, death_year - birth_year as lifespan
    from person_years
    where birth_year is not null
      and death_year is not null
      and death_year >= birth_year
  )
  select avg(lifespan), avg(lifespan) filter (where lifespan >= 16)
    into avg_lifespan_all, avg_age16
    from spans;

  with ordered as (
    select p.id,
           p.tree_id,
           p.first_name,
           p.last_name,
           coalesce((regexp_match(p.birth_date_text, '(\d{4})'))[1], null)::int as birth_year
    from public.persons p
    where p.tree_id = target_tree_id
      and p.birth_date_text is not null
  )
  select * into oldest_row
  from ordered
  where birth_year is not null
  order by birth_year
  limit 1;

  with child_counts as (
    select person_id,
           count(*) as child_count
    from public.relationships
    where tree_id = target_tree_id
      and type in ('bio_father','bio_mother','adoptive_father','adoptive_mother','step_parent','guardian')
    group by person_id
  )
  select cc.person_id,
         cc.child_count,
         p.first_name,
         p.last_name,
         p.tree_id
    into most_children_row
    from child_counts cc
    join public.persons p on p.id = cc.person_id
   order by cc.child_count desc
   limit 1;

  with marriage_counts as (
    select person_id,
           count(*) as marriage_count
    from public.relationships
    where tree_id = target_tree_id
      and type = 'marriage'
    group by person_id
  )
  select mc.person_id,
         mc.marriage_count,
         p.first_name,
         p.last_name,
         p.tree_id
    into most_marriages_row
    from marriage_counts mc
    join public.persons p on p.id = mc.person_id
   order by mc.marriage_count desc
   limit 1;

  with person_years as (
    select
      coalesce((regexp_match(birth_date_text, '(\d{4})'))[1], null)::int as birth_year,
      coalesce((regexp_match(death_date_text, '(\d{4})'))[1], null)::int as death_year
    from public.persons
    where tree_id = target_tree_id
  ),
  buckets as (
    select
      floor(birth_year / 100) * 100 as century_start,
      count(*) as people,
      avg((death_year - birth_year)::numeric)
        filter (where birth_year is not null and death_year is not null and death_year >= birth_year) as avg_age
    from person_years
    where birth_year is not null
    group by floor(birth_year / 100) * 100
    order by century_start
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'label', concat(century_start, 's'),
      'startYear', century_start,
      'people', people,
      'averageAge', case when avg_age is null then null else round(avg_age)::int end
    )), '[]'::jsonb)
    into century_json
    from buckets;

  return jsonb_build_object(
    'totalIndividuals', total_people,
    'maleCount', male_count,
    'femaleCount', female_count,
    'unknownGenderCount', unknown_gender_count,
    'livingCount', living_count,
    'deceasedCount', deceased_count,
    'marriages', marriage_count,
    'averageLifespan', case when avg_lifespan_all is null then null else round(avg_lifespan_all)::int end,
    'averageAgeOver16', case when avg_age16 is null then null else round(avg_age16)::int end,
    'oldestPerson', case when oldest_row.id is not null then jsonb_build_object('id', oldest_row.id, 'treeId', target_tree_id, 'firstName', oldest_row.first_name, 'lastName', oldest_row.last_name, 'year', oldest_row.birth_year) else null end,
    'mostChildren', case when most_children_row.person_id is not null then jsonb_build_object('id', most_children_row.person_id, 'treeId', most_children_row.tree_id, 'firstName', most_children_row.first_name, 'lastName', most_children_row.last_name, 'count', most_children_row.child_count) else null end,
    'mostMarriages', case when most_marriages_row.person_id is not null then jsonb_build_object('id', most_marriages_row.person_id, 'treeId', most_marriages_row.tree_id, 'firstName', most_marriages_row.first_name, 'lastName', most_marriages_row.last_name, 'count', most_marriages_row.marriage_count) else null end,
    'centuryStats', century_json
  );
end;
$$;

