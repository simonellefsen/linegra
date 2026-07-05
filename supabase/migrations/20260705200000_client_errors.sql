-- Roadmap V2 — client-side error capture for production observability.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  kind text not null default 'error',
  message text not null,
  stack_hash text not null,
  route text,
  source text,
  user_agent text
);

create index if not exists client_errors_recorded_idx
  on public.client_errors (recorded_at desc);
create index if not exists client_errors_stack_hash_idx
  on public.client_errors (stack_hash, recorded_at desc);
create index if not exists client_errors_route_idx
  on public.client_errors (route, recorded_at desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors
  for select using (public.is_superadmin());

create or replace function public.record_client_error(
  payload_kind text,
  payload_message text,
  payload_stack_hash text,
  payload_route text default null,
  payload_source text default null,
  payload_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_kind text := coalesce(nullif(trim(payload_kind), ''), 'error');
  normalized_message text := left(coalesce(nullif(trim(payload_message), ''), 'Unknown error'), 500);
  normalized_hash text := left(coalesce(nullif(trim(payload_stack_hash), ''), 'unknown'), 64);
  normalized_route text := nullif(left(coalesce(payload_route, ''), 500), '');
  normalized_source text := nullif(left(coalesce(payload_source, ''), 200), '');
  normalized_user_agent text := nullif(left(coalesce(payload_user_agent, ''), 500), '');
begin
  if normalized_hash = 'unknown' and normalized_message = 'Unknown error' then
    return;
  end if;

  if exists (
    select 1
    from public.client_errors ce
    where ce.stack_hash = normalized_hash
      and coalesce(ce.route, '') = coalesce(normalized_route, '')
      and ce.recorded_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.client_errors (
    kind,
    message,
    stack_hash,
    route,
    source,
    user_agent
  )
  values (
    normalized_kind,
    normalized_message,
    normalized_hash,
    normalized_route,
    normalized_source,
    normalized_user_agent
  );
end;
$$;

create or replace function public.admin_get_client_error_stats(payload_days int default 30)
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
      from public.client_errors
      where recorded_at >= now() - (window_days || ' days')::interval
    ),
    totals as (
      select
        count(*)::int as hits,
        count(distinct stack_hash)::int as unique_signatures
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
    by_route as (
      select
        coalesce(nullif(route, ''), '/') as route,
        count(*)::int as hits
      from scope
      group by 1
      order by hits desc, route
      limit 20
    ),
    by_kind as (
      select
        kind,
        count(*)::int as hits
      from scope
      group by kind
      order by hits desc, kind
    ),
    top_errors as (
      select
        message,
        stack_hash,
        count(*)::int as hits,
        max(recorded_at) as last_seen
      from scope
      group by message, stack_hash
      order by hits desc, last_seen desc
      limit 25
    ),
    recent as (
      select
        recorded_at,
        kind,
        message,
        stack_hash,
        route,
        source
      from scope
      order by recorded_at desc
      limit 25
    )
    select jsonb_build_object(
      'days', window_days,
      'totals', coalesce((select to_jsonb(t) from totals t), '{}'::jsonb),
      'byDay', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from by_day d), '[]'::jsonb),
      'byRoute', coalesce((select jsonb_agg(to_jsonb(r) order by r.hits desc, r.route) from by_route r), '[]'::jsonb),
      'byKind', coalesce((select jsonb_agg(to_jsonb(k) order by k.hits desc, k.kind) from by_kind k), '[]'::jsonb),
      'topErrors', coalesce((select jsonb_agg(to_jsonb(e) order by e.hits desc, e.last_seen desc) from top_errors e), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc) from recent r), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.record_client_error(text, text, text, text, text, text) from public;
revoke all on function public.admin_get_client_error_stats(int) from public, anon;

grant execute on function public.record_client_error(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_get_client_error_stats(int) to authenticated;
