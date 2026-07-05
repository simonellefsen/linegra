-- Fix: admin_upsert_ai_settings RETURNS TABLE(provider ...) shadows the table column name,
-- so `where provider = ...` inside the function body is ambiguous.

create or replace function public.admin_upsert_ai_settings(
  payload_provider text default 'openrouter',
  payload_enabled boolean default true,
  payload_api_key text default null,
  payload_model text default null,
  payload_base_url text default null,
  payload_actor_name text default 'System',
  payload_caps_enabled boolean default null,
  payload_daily_global_cost_cap_usd numeric default null,
  payload_daily_tree_cost_cap_usd numeric default null
)
returns table (
  provider text,
  enabled boolean,
  model text,
  base_url text,
  has_api_key boolean,
  caps_enabled boolean,
  daily_global_cost_cap_usd numeric,
  daily_tree_cost_cap_usd numeric,
  updated_at timestamptz,
  updated_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_provider text := coalesce(nullif(btrim(payload_provider), ''), 'openrouter');
  normalized_model text;
  normalized_base_url text;
  normalized_api_key text;
  saved_row public.ai_provider_settings;
  next_metadata jsonb;
begin
  if normalized_provider <> 'openrouter' then
    raise exception 'Unsupported AI provider: %', normalized_provider;
  end if;

  normalized_model := coalesce(nullif(btrim(payload_model), ''), 'nvidia/nemotron-nano-12b-v2-vl:free');
  normalized_base_url := coalesce(nullif(btrim(payload_base_url), ''), 'https://openrouter.ai/api/v1');
  normalized_api_key := nullif(btrim(coalesce(payload_api_key, '')), '');

  select coalesce(s.metadata, '{}'::jsonb)
  into next_metadata
  from public.ai_provider_settings s
  where s.provider = normalized_provider;

  next_metadata := coalesce(next_metadata, '{}'::jsonb);

  if payload_caps_enabled is not null then
    next_metadata := next_metadata || jsonb_build_object('caps_enabled', payload_caps_enabled);
  end if;
  if payload_daily_global_cost_cap_usd is not null then
    next_metadata := next_metadata || jsonb_build_object(
      'daily_global_cost_cap_usd', greatest(payload_daily_global_cost_cap_usd, 0)
    );
  end if;
  if payload_daily_tree_cost_cap_usd is not null then
    next_metadata := next_metadata || jsonb_build_object(
      'daily_tree_cost_cap_usd', greatest(payload_daily_tree_cost_cap_usd, 0)
    );
  end if;

  insert into public.ai_provider_settings as settings (
    provider,
    enabled,
    api_key,
    model,
    base_url,
    metadata,
    updated_at,
    updated_by
  )
  values (
    normalized_provider,
    coalesce(payload_enabled, true),
    normalized_api_key,
    normalized_model,
    normalized_base_url,
    next_metadata,
    now(),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System')
  )
  on conflict on constraint ai_provider_settings_pkey do update
  set
    enabled = excluded.enabled,
    api_key = coalesce(excluded.api_key, settings.api_key),
    model = excluded.model,
    base_url = excluded.base_url,
    metadata = next_metadata,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning settings.* into saved_row;

  return query
  select
    saved_row.provider,
    saved_row.enabled,
    saved_row.model,
    saved_row.base_url,
    (nullif(btrim(coalesce(saved_row.api_key, '')), '') is not null) as has_api_key,
    coalesce((saved_row.metadata->>'caps_enabled')::boolean, true) as caps_enabled,
    coalesce((saved_row.metadata->>'daily_global_cost_cap_usd')::numeric, 5) as daily_global_cost_cap_usd,
    coalesce((saved_row.metadata->>'daily_tree_cost_cap_usd')::numeric, 1) as daily_tree_cost_cap_usd,
    saved_row.updated_at,
    saved_row.updated_by;
end;
$$;

select pg_notify('pgrst', 'reload schema');
