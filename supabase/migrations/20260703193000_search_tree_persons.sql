-- Fast person search for large trees: bypass per-row RLS scans and use trigram name indexes.

create extension if not exists pg_trgm;

create index if not exists persons_tree_id_idx
  on public.persons (tree_id);

create index if not exists persons_search_name_trgm_idx
  on public.persons using gin (
    lower(
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(maiden_name, '')
    ) gin_trgm_ops
  );

create or replace function public.search_tree_persons(
  target_tree_id uuid,
  search_query text,
  result_limit int default 40,
  result_offset int default 0,
  filter_living_only boolean default false,
  filter_deceased_only boolean default false,
  filter_missing_data boolean default false,
  filter_gender text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      greatest(1, least(coalesce(result_limit, 40), 100)) as safe_limit,
      greatest(coalesce(result_offset, 0), 0) as safe_offset,
      array_remove(
        regexp_split_to_array(lower(trim(coalesce(search_query, ''))), '\s+'),
        ''
      ) as tokens
  ),
  visible as (
    select
      p.id,
      p.tree_id,
      p.first_name,
      p.last_name,
      p.maiden_name,
      p.gender,
      p.birth_date_text,
      p.death_date_text,
      p.birth_place_text,
      p.death_place_text,
      p.burial_date_text,
      p.burial_place_text,
      p.residence_at_death_text,
      p.metadata,
      p.bio,
      p.occupations,
      p.updated_at,
      p.created_by,
      p.is_dna_match,
      p.dna_match_info,
      p.is_living,
      p.is_private
    from public.persons p
    cross join params
    where public.can_read_tree(target_tree_id)
      and p.tree_id = target_tree_id
      and (
        public.can_write_tree(target_tree_id)
        or not coalesce(p.is_private, false)
      )
      and (
        not filter_living_only
        or coalesce(p.is_living, false) = true
        or p.death_date_text is null
      )
      and (
        not filter_deceased_only
        or coalesce(p.is_living, false) = false
        or p.death_date_text is not null
      )
      and (
        not filter_missing_data
        or p.birth_date_text is null
        or p.death_date_text is null
        or p.birth_place_text is null
        or p.death_place_text is null
      )
      and (
        filter_gender is null
        or filter_gender = ''
        or p.gender::text = filter_gender
      )
  ),
  matched as (
    select v.*
    from visible v
    cross join params
    where coalesce(array_length(params.tokens, 1), 0) > 0
      and not exists (
        select 1
        from unnest(params.tokens) as search_token(token)
        where not (
          lower(coalesce(v.first_name, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.last_name, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.maiden_name, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.birth_date_text, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.death_date_text, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.birth_place_text, '')) like '%' || search_token.token || '%'
          or lower(coalesce(v.death_place_text, '')) like '%' || search_token.token || '%'
        )
      )
  ),
  counted as (
    select count(*)::int as total_count
    from (
      select 1
      from matched
      limit 10001
    ) as capped
  ),
  paged as (
    select to_jsonb(m) as row_json
    from matched m
    cross join params
    order by lower(coalesce(m.last_name, '')), lower(coalesce(m.first_name, '')), m.id
    offset (select safe_offset from params)
    limit (select safe_limit from params)
  )
  select jsonb_build_object(
    'total', coalesce((select total_count from counted), 0),
    'results', coalesce((select jsonb_agg(row_json) from paged), '[]'::jsonb)
  );
$$;

revoke all on function public.search_tree_persons(uuid, text, int, int, boolean, boolean, boolean, text) from public;
grant execute on function public.search_tree_persons(uuid, text, int, int, boolean, boolean, boolean, text) to anon, authenticated;
