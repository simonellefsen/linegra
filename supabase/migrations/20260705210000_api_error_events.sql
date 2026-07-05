-- Roadmap V3 — Edge/API non-2xx error capture for admin observability.

create table if not exists public.api_error_events (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  source text not null,
  route text not null,
  status_code smallint not null,
  message text
);

create index if not exists api_error_events_recorded_idx
  on public.api_error_events (recorded_at desc);
create index if not exists api_error_events_source_idx
  on public.api_error_events (source, recorded_at desc);
create index if not exists api_error_events_route_idx
  on public.api_error_events (route, recorded_at desc);

alter table public.api_error_events enable row level security;

drop policy if exists api_error_events_select on public.api_error_events;
create policy api_error_events_select on public.api_error_events
  for select using (public.is_superadmin());

create or replace function public.record_api_error(
  payload_source text,
  payload_route text,
  payload_status_code int,
  payload_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source text := coalesce(nullif(trim(payload_source), ''), 'unknown');
  normalized_route text := left(coalesce(nullif(trim(payload_route), ''), 'unknown'), 500);
  normalized_status int := greatest(100, least(coalesce(payload_status_code, 500), 599));
  normalized_message text := nullif(left(coalesce(payload_message, ''), 500), '');
begin
  if normalized_status < 400 then
    return;
  end if;

  if exists (
    select 1
    from public.api_error_events e
    where e.source = normalized_source
      and e.route = normalized_route
      and e.status_code = normalized_status
      and coalesce(e.message, '') = coalesce(normalized_message, '')
      and e.recorded_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.api_error_events (source, route, status_code, message)
  values (normalized_source, normalized_route, normalized_status, normalized_message);
end;
$$;

create or replace function public.admin_get_api_error_stats(payload_days int default 30)
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
      from public.api_error_events
      where recorded_at >= now() - (window_days || ' days')::interval
    ),
    totals as (
      select
        count(*)::int as hits,
        count(distinct route)::int as unique_routes,
        count(distinct source)::int as unique_sources
      from scope
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
    by_source as (
      select source, count(*)::int as hits
      from scope
      group by source
      order by hits desc, source
    ),
    by_route as (
      select route, count(*)::int as hits
      from scope
      group by route
      order by hits desc, route
      limit 25
    ),
    by_status as (
      select status_code, count(*)::int as hits
      from scope
      group by status_code
      order by hits desc, status_code
    ),
    recent as (
      select recorded_at, source, route, status_code, message
      from scope
      order by recorded_at desc
      limit 25
    ),
    ai_scope as (
      select *
      from public.ai_usage_logs
      where created_at >= now() - (window_days || ' days')::interval
        and coalesce(status, '') <> 'ok'
    ),
    ai_totals as (
      select count(*)::int as hits
      from ai_scope
    ),
    ai_by_purpose as (
      select
        coalesce(nullif(purpose, ''), 'unknown') as purpose,
        count(*)::int as hits
      from ai_scope
      group by 1
      order by hits desc, purpose
      limit 15
    ),
    ai_recent as (
      select created_at as recorded_at, purpose, model, error, status
      from ai_scope
      order by created_at desc
      limit 15
    )
    select jsonb_build_object(
      'days', window_days,
      'totals', coalesce((select to_jsonb(t) from totals t), '{}'::jsonb),
      'byDay', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from by_day d), '[]'::jsonb),
      'bySource', coalesce((select jsonb_agg(to_jsonb(s) order by s.hits desc, s.source) from by_source s), '[]'::jsonb),
      'byRoute', coalesce((select jsonb_agg(to_jsonb(r) order by r.hits desc, r.route) from by_route r), '[]'::jsonb),
      'byStatus', coalesce((select jsonb_agg(to_jsonb(s) order by s.hits desc, s.status_code) from by_status s), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from recent r), '[]'::jsonb),
      'aiProxy', jsonb_build_object(
        'totals', coalesce((select to_jsonb(t) from ai_totals t), '{"hits":0}'::jsonb),
        'byPurpose', coalesce((select jsonb_agg(to_jsonb(p) order by p.hits desc, p.purpose) from ai_by_purpose p), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from ai_recent r), '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.record_api_error(text, text, int, text) from public;
revoke all on function public.admin_get_api_error_stats(int) from public, anon;

grant execute on function public.record_api_error(text, text, int, text) to anon, authenticated;
grant execute on function public.admin_get_api_error_stats(int) to authenticated;
