-- Roadmap N: per-call AI usage logging (model / tokens / cost / tree) for the server-side
-- OpenRouter proxy (supabase/functions/ai-proxy). Written by the Edge Function with the
-- service-role key (bypasses RLS — there is intentionally no INSERT policy). Read aggregates
-- back via admin_get_ai_usage_summary (Database panel "AI Usage" section).
--
-- Auth model: this follows the existing single-admin convention (SECURITY DEFINER admin RPCs
-- without an explicit guard, e.g. admin_get_ai_settings_metadata). The row-level SELECT policy
-- scopes direct reads to trees the caller can read; the aggregate RPC is admin-only in practice
-- until roadmap A (multi-user auth) lands a real guard.

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.family_trees(id) on delete set null,
  actor_id text,
  purpose text not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_estimate numeric(12,6) not null default 0,
  latency_ms integer,
  status text not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
create index if not exists ai_usage_logs_tree_idx on public.ai_usage_logs (tree_id, created_at desc);
create index if not exists ai_usage_logs_purpose_idx on public.ai_usage_logs (purpose, created_at desc);

alter table public.ai_usage_logs enable row level security;

-- Direct SELECT honors tree read access. No INSERT policy: rows are written only by the
-- service-role client inside the ai-proxy Edge Function (RLS is bypassed for the service role).
drop policy if exists ai_usage_logs_select on public.ai_usage_logs;
create policy ai_usage_logs_select on public.ai_usage_logs
  for select using (public.can_read_tree(tree_id));

-- Aggregate view for the admin "AI Usage" panel: totals + per-purpose + per-tree rollups over the
-- last `payload_days` days (default 30). Returns a single jsonb blob (one round-trip).
create or replace function public.admin_get_ai_usage_summary(payload_days int default 30)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with scope as (
    select *
    from public.ai_usage_logs
    where created_at >= now() - (coalesce(payload_days, 30) || ' days')::interval
  ),
  totals as (
    select
      count(*)::int                                            as calls,
      count(*) filter (where status = 'ok')::int               as ok,
      count(*) filter (where coalesce(status,'') <> 'ok')::int as errors,
      coalesce(sum(prompt_tokens), 0)::bigint                  as prompt_tokens,
      coalesce(sum(completion_tokens), 0)::bigint              as completion_tokens,
      coalesce(sum(total_tokens), 0)::bigint                   as total_tokens,
      coalesce(sum(cost_estimate), 0)::numeric                 as cost_estimate
    from scope
  ),
  by_purpose as (
    select coalesce(nullif(purpose, ''), 'unknown') as purpose,
           count(*)::int                            as calls,
           coalesce(sum(total_tokens), 0)::bigint   as total_tokens,
           coalesce(sum(cost_estimate), 0)::numeric as cost_estimate
    from scope
    group by 1
  ),
  by_tree as (
    select l.tree_id,
           t.name                                 as tree_name,
           count(*)::int                          as calls,
           coalesce(sum(l.total_tokens), 0)::bigint   as total_tokens,
           coalesce(sum(l.cost_estimate), 0)::numeric as cost_estimate
    from scope l
    left join public.family_trees t on t.id = l.tree_id
    group by l.tree_id, t.name
    order by calls desc
    limit 20
  )
  select jsonb_build_object(
    'days', coalesce(payload_days, 30),
    'since', (now() - (coalesce(payload_days, 30) || ' days')::interval)::timestamptz,
    'totals', (select to_jsonb(totals) from totals),
    'byPurpose', coalesce((
      select jsonb_agg(jsonb_build_object(
        'purpose', purpose, 'calls', calls, 'total_tokens', total_tokens, 'cost_estimate', cost_estimate
      ) order by calls desc) from by_purpose
    ), '[]'::jsonb),
    'byTree', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tree_id', tree_id, 'tree_name', tree_name, 'calls', calls,
        'total_tokens', total_tokens, 'cost_estimate', cost_estimate
      )) from by_tree
    ), '[]'::jsonb)
  );
$$;

select pg_notify('pgrst', 'reload schema');
