-- Roadmap U10 — persist bot / LLM crawler hits on public crawl APIs for admin metrics.

create table if not exists public.public_crawl_events (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  route text not null,
  agent_bucket text not null,
  resource_id uuid,
  response_format text,
  is_bot boolean not null default true
);

create index if not exists public_crawl_events_recorded_idx
  on public.public_crawl_events (recorded_at desc);
create index if not exists public_crawl_events_agent_idx
  on public.public_crawl_events (agent_bucket, recorded_at desc);
create index if not exists public_crawl_events_route_idx
  on public.public_crawl_events (route, recorded_at desc);

alter table public.public_crawl_events enable row level security;

-- Rows are written only via record_public_crawl_event (security definer). Superadmins read via RPC.
drop policy if exists public_crawl_events_select on public.public_crawl_events;
create policy public_crawl_events_select on public.public_crawl_events
  for select using (public.is_superadmin());

create or replace function public.record_public_crawl_event(
  payload_route text,
  payload_agent_bucket text,
  payload_resource_id uuid default null,
  payload_format text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(payload_agent_bucket, ''), 'browser') = 'browser' then
    return;
  end if;

  insert into public.public_crawl_events (
    route,
    agent_bucket,
    resource_id,
    response_format,
    is_bot
  )
  values (
    coalesce(nullif(payload_route, ''), 'unknown'),
    coalesce(nullif(payload_agent_bucket, ''), 'unknown'),
    payload_resource_id,
    nullif(payload_format, ''),
    true
  );
end;
$$;

create or replace function public.admin_get_crawl_traffic_stats(payload_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  window_days int := greatest(coalesce(payload_days, 30), 1);
begin
  perform public.assert_superadmin();

  return (
    with scope as (
      select *
      from public.public_crawl_events
      where recorded_at >= now() - (window_days || ' days')::interval
    ),
    totals as (
      select
        count(*)::int as hits,
        count(distinct agent_bucket)::int as unique_agents,
        count(*) filter (
          where agent_bucket in ('gptbot', 'claudebot', 'perplexitybot')
        )::int as llm_hits
      from scope
    ),
    by_agent as (
      select
        agent_bucket,
        count(*)::int as hits,
        max(recorded_at) as last_seen
      from scope
      group by agent_bucket
      order by hits desc, agent_bucket
    ),
    by_route as (
      select
        route,
        count(*)::int as hits
      from scope
      group by route
      order by hits desc, route
    ),
    by_day as (
      select
        to_char(date_trunc('day', recorded_at at time zone 'utc'), 'YYYY-MM-DD') as day,
        count(*)::int as hits
      from scope
      group by 1
      order by 1 desc
      limit 30
    ),
    recent as (
      select
        recorded_at,
        route,
        agent_bucket,
        resource_id,
        response_format
      from scope
      order by recorded_at desc
      limit 25
    )
    select jsonb_build_object(
      'days', window_days,
      'totals', coalesce((select to_jsonb(t) from totals t), '{}'::jsonb),
      'by_agent', coalesce((select jsonb_agg(to_jsonb(a)) from by_agent a), '[]'::jsonb),
      'by_route', coalesce((select jsonb_agg(to_jsonb(r)) from by_route r), '[]'::jsonb),
      'by_day', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from by_day d), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from recent r), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.record_public_crawl_event(text, text, uuid, text) from public;
revoke all on function public.admin_get_crawl_traffic_stats(int) from public, anon;

grant execute on function public.record_public_crawl_event(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_get_crawl_traffic_stats(int) to authenticated;

select pg_notify('pgrst', 'reload schema');
