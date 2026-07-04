-- Visitor (non-bot) traffic + geo fields + bot drill-down on public_crawl_events.

alter table public.public_crawl_events
  add column if not exists country_code text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists user_agent text;

create index if not exists public_crawl_events_is_bot_idx
  on public.public_crawl_events (is_bot, recorded_at desc);
create index if not exists public_crawl_events_country_idx
  on public.public_crawl_events (country_code, recorded_at desc)
  where is_bot = false;

drop function if exists public.record_public_crawl_event(text, text, uuid, text);

create or replace function public.record_public_crawl_event(
  payload_route text,
  payload_agent_bucket text,
  payload_resource_id uuid default null,
  payload_format text default null,
  payload_country_code text default null,
  payload_region text default null,
  payload_city text default null,
  payload_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  agent text := coalesce(nullif(payload_agent_bucket, ''), 'unknown');
  is_bot_hit boolean := agent <> 'browser';
begin
  insert into public.public_crawl_events (
    route,
    agent_bucket,
    resource_id,
    response_format,
    is_bot,
    country_code,
    region,
    city,
    user_agent
  )
  values (
    coalesce(nullif(payload_route, ''), 'unknown'),
    agent,
    payload_resource_id,
    nullif(payload_format, ''),
    is_bot_hit,
    nullif(upper(left(coalesce(payload_country_code, ''), 2)), ''),
    nullif(left(coalesce(payload_region, ''), 120), ''),
    nullif(left(coalesce(payload_city, ''), 120), ''),
    nullif(left(coalesce(payload_user_agent, ''), 500), '')
  );
end;
$$;

drop function if exists public.admin_get_crawl_traffic_stats(int);

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
  agent_filter text := nullif(lower(trim(coalesce(payload_agent_filter, ''))), '');
begin
  perform public.assert_superadmin();

  return (
    with scope as (
      select *
      from public.public_crawl_events
      where recorded_at >= now() - (window_days || ' days')::interval
    ),
    bot_scope as (
      select *
      from scope
      where is_bot = true
        and (agent_filter is null or agent_bucket = agent_filter)
    ),
    visitor_scope as (
      select *
      from scope
      where is_bot = false
    ),
    bot_totals as (
      select
        count(*)::int as hits,
        count(distinct agent_bucket)::int as unique_agents,
        count(*) filter (
          where agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')
        )::int as llm_hits
      from scope
      where is_bot = true
    ),
    bot_by_agent as (
      select
        agent_bucket,
        count(*)::int as hits,
        max(recorded_at) as last_seen
      from scope
      where is_bot = true
      group by agent_bucket
      order by hits desc, agent_bucket
    ),
    bot_by_route as (
      select
        route,
        count(*)::int as hits
      from bot_scope
      group by route
      order by hits desc, route
    ),
    bot_by_day as (
      select
        to_char(date_trunc('day', recorded_at at time zone 'utc'), 'YYYY-MM-DD') as day,
        count(*)::int as hits
      from bot_scope
      group by 1
      order by 1 desc
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
      from bot_scope
      order by recorded_at desc
      limit 25
    ),
    visitor_totals as (
      select
        count(*)::int as hits,
        count(distinct country_code) filter (where country_code is not null)::int as unique_countries,
        count(distinct route)::int as unique_routes
      from visitor_scope
    ),
    visitor_by_country as (
      select
        coalesce(country_code, '??') as country_code,
        count(*)::int as hits,
        max(recorded_at) as last_seen
      from visitor_scope
      group by 1
      order by hits desc, country_code
      limit 30
    ),
    visitor_by_route as (
      select
        route,
        count(*)::int as hits
      from visitor_scope
      group by route
      order by hits desc, route
    ),
    visitor_by_day as (
      select
        to_char(date_trunc('day', recorded_at at time zone 'utc'), 'YYYY-MM-DD') as day,
        count(*)::int as hits
      from visitor_scope
      group by 1
      order by 1 desc
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
      from visitor_scope
      order by recorded_at desc
      limit 25
    )
    select jsonb_build_object(
      'days', window_days,
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

revoke all on function public.record_public_crawl_event(text, text, uuid, text, text, text, text, text) from public;
revoke all on function public.admin_get_crawl_traffic_stats(int, text) from public, anon;

grant execute on function public.record_public_crawl_event(text, text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_get_crawl_traffic_stats(int, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
