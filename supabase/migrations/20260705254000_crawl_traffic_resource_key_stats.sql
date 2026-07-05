-- U18f — expose resource_key in traffic stats recent rows (patch if 20260705253000 already applied).

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
    bot_scope_deduped as (
      select distinct on (
        route,
        coalesce(resource_key, resource_id::text, ''),
        agent_bucket,
        coalesce(response_format, ''),
        coalesce(user_agent, ''),
        date_trunc('minute', recorded_at)
      )
        *
      from bot_scope_raw
      order by
        route,
        coalesce(resource_key, resource_id::text, ''),
        agent_bucket,
        coalesce(response_format, ''),
        coalesce(user_agent, ''),
        date_trunc('minute', recorded_at),
        recorded_at desc
    ),
    bot_totals as (
      select
        coalesce((select count(*)::int from bot_scope_deduped), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = true), 0) as hits,
        (
          select count(distinct agent_bucket)::int
          from (
            select agent_bucket from bot_scope_deduped
            union
            select agent_bucket from rollup_scope where is_bot = true
          ) agents
        ) as unique_agents,
        coalesce((select count(*)::int from bot_scope_deduped where agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = true and agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')), 0) as llm_hits
    ),
    bot_by_agent as (
      select agent_bucket, sum(hits)::int as hits, max(last_seen) as last_seen
      from (
        select agent_bucket, count(*)::bigint as hits, max(recorded_at) as last_seen
        from bot_scope_deduped
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
        select route, count(*)::bigint as hits from bot_scope_deduped group by route
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
        from bot_scope_deduped
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
        resource_key,
        response_format,
        user_agent
      from bot_scope_deduped
      order by recorded_at desc
      limit 25
    ),
    visitor_scope_raw as (
      select *
      from raw_scope
      where is_bot = false
    ),
    visitor_scope_deduped as (
      select distinct on (
        route,
        coalesce(resource_key, resource_id::text, ''),
        coalesce(user_agent, ''),
        date_trunc('minute', recorded_at)
      )
        *
      from visitor_scope_raw
      order by
        route,
        coalesce(resource_key, resource_id::text, ''),
        coalesce(user_agent, ''),
        date_trunc('minute', recorded_at),
        recorded_at desc
    ),
    visitor_totals as (
      select
        coalesce((select count(*)::int from visitor_scope_deduped), 0)
        + coalesce((select sum(hits)::int from rollup_scope where is_bot = false), 0) as hits,
        (
          select count(distinct country_code)::int
          from (
            select country_code from visitor_scope_deduped where country_code is not null
            union
            select nullif(country_code, '') from rollup_scope where is_bot = false and country_code <> ''
          ) countries
        ) as unique_countries,
        (
          select count(distinct route)::int
          from (
            select route from visitor_scope_deduped
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
        from visitor_scope_deduped
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
        select route, count(*)::bigint as hits from visitor_scope_deduped group by route
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
        from visitor_scope_deduped
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
        resource_id,
        resource_key
      from visitor_scope_deduped
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

revoke all on function public.admin_get_crawl_traffic_stats(int, text) from public, anon;
grant execute on function public.admin_get_crawl_traffic_stats(int, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
