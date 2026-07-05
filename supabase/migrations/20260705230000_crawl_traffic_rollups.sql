-- U10a — aggregate public crawl traffic into rollups and prune raw events.

create table if not exists public.public_crawl_traffic_rollups (
  grain text not null check (grain in ('hour', 'day', 'week', 'month', 'year')),
  period_start timestamptz not null,
  is_bot boolean not null,
  agent_bucket text not null,
  route text not null,
  country_code text not null default '',
  hits bigint not null default 0,
  unique_resources bigint not null default 0,
  primary key (grain, period_start, is_bot, agent_bucket, route, country_code)
);

create index if not exists public_crawl_traffic_rollups_period_idx
  on public.public_crawl_traffic_rollups (grain, period_start desc);

alter table public.public_crawl_traffic_rollups enable row level security;

drop policy if exists public_crawl_traffic_rollups_select on public.public_crawl_traffic_rollups;
create policy public_crawl_traffic_rollups_select on public.public_crawl_traffic_rollups
  for select using (public.is_superadmin());

create or replace function public.rollup_public_crawl_traffic(
  payload_retention_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  retention_days int := greatest(coalesce(payload_retention_days, 14), 1);
  hour_rows int := 0;
  day_rows int := 0;
  week_rows int := 0;
  month_rows int := 0;
  year_rows int := 0;
  pruned_rows int := 0;
begin
  insert into public.public_crawl_traffic_rollups as r (
    grain, period_start, is_bot, agent_bucket, route, country_code, hits, unique_resources
  )
  select
    'hour',
    date_trunc('hour', recorded_at),
    is_bot,
    agent_bucket,
    route,
    coalesce(country_code, ''),
    count(*)::bigint,
    count(distinct resource_id)::bigint
  from public.public_crawl_events
  where recorded_at < date_trunc('hour', now())
    and recorded_at >= now() - interval '14 days'
  group by 2, 3, 4, 5, 6
  on conflict on constraint public_crawl_traffic_rollups_pkey do update
    set hits = excluded.hits,
        unique_resources = excluded.unique_resources;
  get diagnostics hour_rows = row_count;

  insert into public.public_crawl_traffic_rollups as r (
    grain, period_start, is_bot, agent_bucket, route, country_code, hits, unique_resources
  )
  select
    'day',
    date_trunc('day', recorded_at at time zone 'utc') at time zone 'utc',
    is_bot,
    agent_bucket,
    route,
    coalesce(country_code, ''),
    count(*)::bigint,
    count(distinct resource_id)::bigint
  from public.public_crawl_events
  where recorded_at < date_trunc('day', now())
  group by 2, 3, 4, 5, 6
  on conflict on constraint public_crawl_traffic_rollups_pkey do update
    set hits = excluded.hits,
        unique_resources = excluded.unique_resources;
  get diagnostics day_rows = row_count;

  insert into public.public_crawl_traffic_rollups as r (
    grain, period_start, is_bot, agent_bucket, route, country_code, hits, unique_resources
  )
  select
    'week',
    date_trunc('week', period_start),
    is_bot,
    agent_bucket,
    route,
    country_code,
    sum(hits)::bigint,
    sum(unique_resources)::bigint
  from public.public_crawl_traffic_rollups
  where grain = 'day'
    and period_start < date_trunc('week', now())
  group by 2, 3, 4, 5, 6
  on conflict on constraint public_crawl_traffic_rollups_pkey do update
    set hits = excluded.hits,
        unique_resources = excluded.unique_resources;
  get diagnostics week_rows = row_count;

  insert into public.public_crawl_traffic_rollups as r (
    grain, period_start, is_bot, agent_bucket, route, country_code, hits, unique_resources
  )
  select
    'month',
    date_trunc('month', period_start),
    is_bot,
    agent_bucket,
    route,
    country_code,
    sum(hits)::bigint,
    sum(unique_resources)::bigint
  from public.public_crawl_traffic_rollups
  where grain = 'day'
    and period_start < date_trunc('month', now())
  group by 2, 3, 4, 5, 6
  on conflict on constraint public_crawl_traffic_rollups_pkey do update
    set hits = excluded.hits,
        unique_resources = excluded.unique_resources;
  get diagnostics month_rows = row_count;

  insert into public.public_crawl_traffic_rollups as r (
    grain, period_start, is_bot, agent_bucket, route, country_code, hits, unique_resources
  )
  select
    'year',
    date_trunc('year', period_start),
    is_bot,
    agent_bucket,
    route,
    country_code,
    sum(hits)::bigint,
    sum(unique_resources)::bigint
  from public.public_crawl_traffic_rollups
  where grain = 'month'
    and period_start < date_trunc('year', now())
  group by 2, 3, 4, 5, 6
  on conflict on constraint public_crawl_traffic_rollups_pkey do update
    set hits = excluded.hits,
        unique_resources = excluded.unique_resources;
  get diagnostics year_rows = row_count;

  delete from public.public_crawl_events
  where recorded_at < now() - (retention_days || ' days')::interval
    and recorded_at < date_trunc('day', now());
  get diagnostics pruned_rows = row_count;

  return jsonb_build_object(
    'retention_days', retention_days,
    'hour_upserts', hour_rows,
    'day_upserts', day_rows,
    'week_upserts', week_rows,
    'month_upserts', month_rows,
    'year_upserts', year_rows,
    'pruned_raw_events', pruned_rows
  );
end;
$$;

drop function if exists public.admin_get_crawl_traffic_stats(int, text);

create or replace function public.admin_get_crawl_traffic_stats(
  payload_days int default 30,
  payload_agent_filter text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  window_days int := greatest(coalesce(payload_days, 30), 1);
  raw_retention_days int := 14;
  agent_filter text := nullif(lower(trim(coalesce(payload_agent_filter, ''))), '');
  window_start timestamptz := now() - (window_days || ' days')::interval;
  raw_cutoff timestamptz := now() - (raw_retention_days || ' days')::interval;
begin
  perform public.assert_superadmin();

  return (
    with raw_scope as (
      select *
      from public.public_crawl_events
      where recorded_at >= window_start
        and recorded_at >= raw_cutoff
    ),
    rollup_scope as (
      select *
      from public.public_crawl_traffic_rollups
      where grain = 'day'
        and period_start >= window_start
        and period_start < raw_cutoff
    ),
    bot_scope_raw as (
      select *
      from raw_scope
      where is_bot = true
        and (agent_filter is null or agent_bucket = agent_filter)
    ),
    bot_totals as (
      select
        coalesce((select count(*)::int from bot_scope_raw), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = true), 0) as hits,
        (
          select count(distinct agent_bucket)::int
          from (
            select agent_bucket from bot_scope_raw
            union
            select agent_bucket from rollup_scope where is_bot = true
          ) agents
        ) as unique_agents,
        coalesce((select count(*)::int from bot_scope_raw where agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = true and agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')), 0) as llm_hits
    ),
    bot_by_agent as (
      select agent_bucket, sum(hits)::int as hits, max(last_seen) as last_seen
      from (
        select agent_bucket, count(*)::bigint as hits, max(recorded_at) as last_seen
        from bot_scope_raw
        group by agent_bucket
        union all
        select agent_bucket, sum(hits)::bigint as hits, max(period_start) as last_seen
        from rollup_scope
        where is_bot = true
        group by agent_bucket
      ) merged
      group by agent_bucket
      order by hits desc, agent_bucket
    ),
    bot_by_route as (
      select route, sum(hits)::int as hits
      from (
        select route, count(*)::bigint as hits from bot_scope_raw group by route
        union all
        select route, sum(hits)::bigint as hits from rollup_scope where is_bot = true group by route
      ) merged
      group by route
      order by hits desc, route
    ),
    bot_by_day as (
      select day, sum(hits)::int as hits
      from (
        select to_char(date_trunc('day', recorded_at at time zone 'utc'), 'YYYY-MM-DD') as day,
               count(*)::bigint as hits
        from bot_scope_raw
        group by 1
        union all
        select to_char(period_start at time zone 'utc', 'YYYY-MM-DD') as day,
               sum(hits)::bigint as hits
        from rollup_scope
        where is_bot = true
        group by 1
      ) merged
      group by day
      order by day desc
      limit 30
    ),
    bot_recent as (
      select
        recorded_at,
        route,
        agent_bucket,
        resource_id,
        response_format,
        user_agent
      from bot_scope_raw
      order by recorded_at desc
      limit 25
    ),
    visitor_scope_raw as (
      select *
      from raw_scope
      where is_bot = false
    ),
    visitor_totals as (
      select
        coalesce((select count(*)::int from visitor_scope_raw), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = false), 0) as hits,
        (
          select count(distinct country_code)::int
          from (
            select country_code from visitor_scope_raw where country_code is not null
            union
            select nullif(country_code, '') from rollup_scope where is_bot = false and country_code <> ''
          ) countries
        ) as unique_countries,
        (
          select count(distinct route)::int
          from (
            select route from visitor_scope_raw
            union
            select route from rollup_scope where is_bot = false
          ) routes
        ) as unique_routes
    ),
    visitor_by_country as (
      select country_code, sum(hits)::int as hits, max(last_seen) as last_seen
      from (
        select coalesce(country_code, '??') as country_code,
               count(*)::bigint as hits,
               max(recorded_at) as last_seen
        from visitor_scope_raw
        group by 1
        union all
        select coalesce(nullif(country_code, ''), '??') as country_code,
               sum(hits)::bigint as hits,
               max(period_start) as last_seen
        from rollup_scope
        where is_bot = false
        group by 1
      ) merged
      group by country_code
      order by hits desc, country_code
      limit 30
    ),
    visitor_by_route as (
      select route, sum(hits)::int as hits
      from (
        select route, count(*)::bigint as hits from visitor_scope_raw group by route
        union all
        select route, sum(hits)::bigint as hits from rollup_scope where is_bot = false group by route
      ) merged
      group by route
      order by hits desc, route
    ),
    visitor_by_day as (
      select day, sum(hits)::int as hits
      from (
        select to_char(date_trunc('day', recorded_at at time zone 'utc'), 'YYYY-MM-DD') as day,
               count(*)::bigint as hits
        from visitor_scope_raw
        group by 1
        union all
        select to_char(period_start at time zone 'utc', 'YYYY-MM-DD') as day,
               sum(hits)::bigint as hits
        from rollup_scope
        where is_bot = false
        group by 1
      ) merged
      group by day
      order by day desc
      limit 30
    ),
    visitor_recent as (
      select
        recorded_at,
        route,
        country_code,
        region,
        city,
        resource_id
      from visitor_scope_raw
      order by recorded_at desc
      limit 25
    )
    select jsonb_build_object(
      'days', window_days,
      'raw_retention_days', raw_retention_days,
      'agent_filter', agent_filter,
      'bot', jsonb_build_object(
        'totals', coalesce((select to_jsonb(t) from bot_totals t), '{}'::jsonb),
        'by_agent', coalesce((select jsonb_agg(to_jsonb(a)) from bot_by_agent a), '[]'::jsonb),
        'by_route', coalesce((select jsonb_agg(to_jsonb(r)) from bot_by_route r), '[]'::jsonb),
        'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from bot_by_day d), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from bot_recent r), '[]'::jsonb)
      ),
      'visitor', jsonb_build_object(
        'totals', coalesce((select to_jsonb(t) from visitor_totals t), '{}'::jsonb),
        'by_country', coalesce((select jsonb_agg(to_jsonb(c)) from visitor_by_country c), '[]'::jsonb),
        'by_route', coalesce((select jsonb_agg(to_jsonb(r)) from visitor_by_route r), '[]'::jsonb),
        'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from visitor_by_day d), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from visitor_recent r), '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.rollup_public_crawl_traffic(int) from public, anon;
grant execute on function public.rollup_public_crawl_traffic(int) to authenticated, service_role;

revoke all on function public.admin_get_crawl_traffic_stats(int, text) from public, anon;
grant execute on function public.admin_get_crawl_traffic_stats(int, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
