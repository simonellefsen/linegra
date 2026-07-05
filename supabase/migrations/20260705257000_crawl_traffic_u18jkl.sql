-- U18j–l — crawl coverage, WoW deltas / first-seen agents, visitor referrer buckets.

alter table public.public_crawl_events
  add column if not exists referrer_bucket text;

create index if not exists public_crawl_events_referrer_bucket_idx
  on public.public_crawl_events (referrer_bucket, recorded_at desc)
  where is_bot = false and referrer_bucket is not null;

drop function if exists public.record_public_crawl_event(text, text, uuid, text, text, text, text, text, text, uuid);

create or replace function public.record_public_crawl_event(
  payload_route text,
  payload_agent_bucket text,
  payload_resource_id uuid default null,
  payload_format text default null,
  payload_country_code text default null,
  payload_region text default null,
  payload_city text default null,
  payload_user_agent text default null,
  payload_resource_key text default null,
  payload_viewer_user_id uuid default null,
  payload_referrer_bucket text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  agent text := coalesce(nullif(payload_agent_bucket, ''), 'unknown');
  is_bot_hit boolean := agent <> 'browser';
  resource_key_value text;
  user_agent_value text;
  viewer_user_id_value uuid;
  referrer_bucket_value text;
begin
  resource_key_value := nullif(
    left(
      coalesce(
        nullif(payload_resource_key, ''),
        payload_resource_id::text,
        ''
      ),
      120
    ),
    ''
  );
  user_agent_value := nullif(left(coalesce(payload_user_agent, ''), 500), '');
  viewer_user_id_value := payload_viewer_user_id;
  referrer_bucket_value := case
    when is_bot_hit then null
    else nullif(lower(left(trim(coalesce(payload_referrer_bucket, '')), 32)), '')
  end;

  if exists (
    select 1
    from public.public_crawl_events e
    where e.route = coalesce(nullif(payload_route, ''), 'unknown')
      and e.agent_bucket = agent
      and e.is_bot = is_bot_hit
      and coalesce(e.resource_key, e.resource_id::text, '') = coalesce(resource_key_value, '')
      and coalesce(e.user_agent, '') = coalesce(user_agent_value, '')
      and coalesce(e.viewer_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(viewer_user_id_value, '00000000-0000-0000-0000-000000000000'::uuid)
      and date_trunc('minute', e.recorded_at) = date_trunc('minute', now())
  ) then
    return;
  end if;

  insert into public.public_crawl_events (
    route,
    agent_bucket,
    resource_id,
    resource_key,
    response_format,
    is_bot,
    country_code,
    region,
    city,
    user_agent,
    viewer_user_id,
    referrer_bucket
  )
  values (
    coalesce(nullif(payload_route, ''), 'unknown'),
    agent,
    payload_resource_id,
    resource_key_value,
    nullif(payload_format, ''),
    is_bot_hit,
    nullif(upper(left(coalesce(payload_country_code, ''), 2)), ''),
    nullif(left(coalesce(payload_region, ''), 120), ''),
    nullif(left(coalesce(payload_city, ''), 120), ''),
    user_agent_value,
    viewer_user_id_value,
    referrer_bucket_value
  );
end;
$$;

revoke all on function public.record_public_crawl_event(text, text, uuid, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.record_public_crawl_event(text, text, uuid, text, text, text, text, text, text, uuid, text) to anon, authenticated;

drop function if exists public.admin_get_crawl_traffic_stats(int, text, uuid);

create or replace function public.admin_get_crawl_traffic_stats(
  payload_days int default 30,
  payload_agent_filter text default null,
  payload_exclude_viewer_user_id uuid default null
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
  exclude_viewer_user_id uuid := payload_exclude_viewer_user_id;
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
        and (
          exclude_viewer_user_id is null
          or viewer_user_id is null
          or viewer_user_id <> exclude_viewer_user_id
        )
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
    bot_wow as (
      select
        count(*) filter (where recorded_at >= now() - interval '7 days')::int as current_week,
        count(*) filter (
          where recorded_at >= now() - interval '14 days'
            and recorded_at < now() - interval '7 days'
        )::int as prior_week
      from bot_scope_deduped
    ),
    llm_wow as (
      select
        count(*) filter (
          where recorded_at >= now() - interval '7 days'
            and agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')
        )::int as current_week,
        count(*) filter (
          where recorded_at >= now() - interval '14 days'
            and recorded_at < now() - interval '7 days'
            and agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')
        )::int as prior_week
      from bot_scope_deduped
    ),
    agent_first_seen as (
      select agent_bucket, min(recorded_at) as first_seen_at
      from public.public_crawl_events
      where is_bot = true
      group by agent_bucket
    ),
    new_agents as (
      select agent_bucket, first_seen_at
      from agent_first_seen
      where first_seen_at >= now() - interval '7 days'
      order by first_seen_at desc
      limit 10
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
    bot_by_agent_format as (
      select
        agent_bucket,
        case lower(coalesce(nullif(trim(response_format), ''), 'unknown'))
          when 'markdown' then 'md'
          else lower(coalesce(nullif(trim(response_format), ''), 'unknown'))
        end as response_format,
        count(*)::int as hits
      from bot_scope_deduped
      group by agent_bucket, 2
      order by hits desc, agent_bucket, response_format
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
    visitor_wow as (
      select
        count(*) filter (where recorded_at >= now() - interval '7 days')::int as current_week,
        count(*) filter (
          where recorded_at >= now() - interval '14 days'
            and recorded_at < now() - interval '7 days'
        )::int as prior_week
      from visitor_scope_deduped
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
    visitor_by_referrer as (
      select referrer_bucket, count(*)::int as hits, max(recorded_at) as last_seen
      from visitor_scope_deduped
      where referrer_bucket is not null
      group by referrer_bucket
      order by hits desc, referrer_bucket
      limit 10
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
        resource_key,
        referrer_bucket
      from visitor_scope_deduped
      order by recorded_at desc
      limit 25
    )
    select jsonb_build_object(
      'days', window_days,
      'raw_retention_days', raw_retention_days,
      'agent_filter', agent_filter,
      'exclude_viewer_user_id', exclude_viewer_user_id,
      'deltas', jsonb_build_object(
        'bot', coalesce((select to_jsonb(w) from bot_wow w), '{}'::jsonb),
        'visitor', coalesce((select to_jsonb(w) from visitor_wow w), '{}'::jsonb),
        'llm', coalesce((select to_jsonb(w) from llm_wow w), '{}'::jsonb)
      ),
      'first_seen_agents', coalesce((select jsonb_agg(to_jsonb(a)) from new_agents a), '[]'::jsonb),
      'bot', jsonb_build_object(
        'totals', coalesce((select to_jsonb(t) from bot_totals t), '{}'::jsonb),
        'by_agent', coalesce((select jsonb_agg(to_jsonb(a)) from bot_by_agent a), '[]'::jsonb),
        'by_agent_format', coalesce((select jsonb_agg(to_jsonb(f)) from bot_by_agent_format f), '[]'::jsonb),
        'by_route', coalesce((select jsonb_agg(to_jsonb(r)) from bot_by_route r), '[]'::jsonb),
        'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from bot_by_day d), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from bot_recent r), '[]'::jsonb)
      ),
      'visitor', jsonb_build_object(
        'totals', coalesce((select to_jsonb(t) from visitor_totals t), '{}'::jsonb),
        'by_country', coalesce((select jsonb_agg(to_jsonb(c)) from visitor_by_country c), '[]'::jsonb),
        'by_referrer', coalesce((select jsonb_agg(to_jsonb(r)) from visitor_by_referrer r), '[]'::jsonb),
        'by_route', coalesce((select jsonb_agg(to_jsonb(r)) from visitor_by_route r), '[]'::jsonb),
        'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from visitor_by_day d), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from visitor_recent r), '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.admin_get_crawl_traffic_stats(int, text, uuid) from public, anon;
grant execute on function public.admin_get_crawl_traffic_stats(int, text, uuid) to authenticated;

create or replace function public.admin_get_crawl_coverage_stats(
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
  window_start timestamptz := now() - (window_days || ' days')::interval;
begin
  perform public.assert_superadmin();

  return (
    with crawlable_persons as (
      select
        p.id as person_id,
        p.tree_id,
        p.first_name,
        p.last_name,
        ft.name as tree_name,
        ft.slug as tree_slug
      from public.persons p
      join public.family_trees ft on ft.id = p.tree_id
      where ft.is_public
        and public.is_person_publicly_crawlable(p.is_private, p.is_living, p.death_date_text)
    ),
    crawled_person_ids as (
      select distinct e.resource_id as person_id
      from public.public_crawl_events e
      where e.is_bot = true
        and e.route = 'person'
        and e.resource_id is not null
        and e.recorded_at >= window_start
        and (agent_filter is null or e.agent_bucket = agent_filter)
    ),
    tree_totals as (
      select
        cp.tree_id,
        max(cp.tree_name) as tree_name,
        max(cp.tree_slug) as tree_slug,
        count(*)::int as total_person_urls
      from crawlable_persons cp
      group by cp.tree_id
    ),
    tree_crawled as (
      select cp.tree_id, count(distinct cp.person_id)::int as crawled_person_urls
      from crawlable_persons cp
      join crawled_person_ids cpi on cpi.person_id = cp.person_id
      group by cp.tree_id
    ),
    tree_rows as (
      select
        tt.tree_id,
        tt.tree_name,
        tt.tree_slug,
        tt.total_person_urls,
        coalesce(tc.crawled_person_urls, 0) as crawled_person_urls,
        case
          when tt.total_person_urls <= 0 then 0
          else round(100.0 * coalesce(tc.crawled_person_urls, 0) / tt.total_person_urls)::int
        end as coverage_percent
      from tree_totals tt
      left join tree_crawled tc on tc.tree_id = tt.tree_id
      order by coverage_percent asc, tt.total_person_urls desc, tt.tree_name
    ),
    never_crawled as (
      select
        ranked.tree_id,
        jsonb_agg(
          jsonb_build_object(
            'person_id', ranked.person_id,
            'first_name', ranked.first_name,
            'last_name', ranked.last_name
          )
          order by ranked.row_number
        ) as never_crawled
      from (
        select
          cp.tree_id,
          cp.person_id,
          cp.first_name,
          cp.last_name,
          row_number() over (
            partition by cp.tree_id
            order by lower(cp.last_name), lower(cp.first_name), cp.person_id
          ) as row_number
        from crawlable_persons cp
        where not exists (
          select 1 from crawled_person_ids cpi where cpi.person_id = cp.person_id
        )
      ) ranked
      where ranked.row_number <= 20
      group by ranked.tree_id
    ),
    trees_with_samples as (
      select
        tr.tree_id,
        tr.tree_name,
        tr.tree_slug,
        tr.total_person_urls,
        tr.crawled_person_urls,
        tr.coverage_percent,
        coalesce(nc.never_crawled, '[]'::jsonb) as never_crawled
      from tree_rows tr
      left join never_crawled nc on nc.tree_id = tr.tree_id
    ),
    by_agent_tree as (
      select
        e.agent_bucket,
        cp.tree_id,
        max(cp.tree_name) as tree_name,
        count(distinct e.resource_id)::int as crawled_person_urls,
        max(tt.total_person_urls) as total_person_urls,
        case
          when max(tt.total_person_urls) <= 0 then 0
          else round(100.0 * count(distinct e.resource_id) / max(tt.total_person_urls))::int
        end as coverage_percent
      from public.public_crawl_events e
      join crawlable_persons cp on cp.person_id = e.resource_id
      join tree_totals tt on tt.tree_id = cp.tree_id
      where e.is_bot = true
        and e.route = 'person'
        and e.resource_id is not null
        and e.recorded_at >= window_start
        and (agent_filter is null or e.agent_bucket = agent_filter)
      group by e.agent_bucket, cp.tree_id
      order by e.agent_bucket, coverage_percent desc, tree_name
    )
    select jsonb_build_object(
      'days', window_days,
      'agent_filter', agent_filter,
      'trees', coalesce((select jsonb_agg(to_jsonb(t)) from trees_with_samples t), '[]'::jsonb),
      'by_agent_tree', coalesce((select jsonb_agg(to_jsonb(r)) from by_agent_tree r), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_get_crawl_coverage_stats(int, text) from public, anon;
grant execute on function public.admin_get_crawl_coverage_stats(int, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
