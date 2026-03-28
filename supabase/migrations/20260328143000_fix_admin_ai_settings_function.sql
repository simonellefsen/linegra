create or replace function public.admin_upsert_ai_settings(
  payload_provider text default 'openrouter',
  payload_enabled boolean default true,
  payload_api_key text default null,
  payload_model text default null,
  payload_base_url text default null,
  payload_actor_name text default 'System'
)
returns table (
  provider text,
  enabled boolean,
  model text,
  base_url text,
  has_api_key boolean,
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
begin
  if normalized_provider <> 'openrouter' then
    raise exception 'Unsupported AI provider: %', normalized_provider;
  end if;

  normalized_model := coalesce(nullif(btrim(payload_model), ''), 'nvidia/nemotron-nano-12b-v2-vl:free');
  normalized_base_url := coalesce(nullif(btrim(payload_base_url), ''), 'https://openrouter.ai/api/v1');
  normalized_api_key := nullif(btrim(coalesce(payload_api_key, '')), '');

  insert into public.ai_provider_settings as settings (
    provider,
    enabled,
    api_key,
    model,
    base_url,
    updated_at,
    updated_by
  )
  values (
    normalized_provider,
    coalesce(payload_enabled, true),
    normalized_api_key,
    normalized_model,
    normalized_base_url,
    now(),
    coalesce(nullif(btrim(payload_actor_name), ''), 'System')
  )
  on conflict on constraint ai_provider_settings_pkey do update
  set
    enabled = excluded.enabled,
    api_key = coalesce(excluded.api_key, settings.api_key),
    model = excluded.model,
    base_url = excluded.base_url,
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
    saved_row.updated_at,
    saved_row.updated_by;
end;
$$;

select pg_notify('pgrst', 'reload schema');
