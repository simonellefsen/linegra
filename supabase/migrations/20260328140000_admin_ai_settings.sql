create table if not exists public.ai_provider_settings (
  provider text primary key,
  enabled boolean not null default true,
  api_key text,
  model text not null,
  base_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.ai_provider_settings enable row level security;

insert into public.ai_provider_settings (provider, enabled, model, base_url)
values ('openrouter', true, 'nvidia/nemotron-nano-12b-v2-vl:free', 'https://openrouter.ai/api/v1')
on conflict (provider) do nothing;

create or replace function public.admin_get_ai_settings_metadata()
returns table (
  provider text,
  enabled boolean,
  model text,
  base_url text,
  has_api_key boolean,
  updated_at timestamptz,
  updated_by text
)
language sql
security definer
set search_path = public
as $$
  select
    s.provider,
    s.enabled,
    s.model,
    s.base_url,
    (nullif(btrim(coalesce(s.api_key, '')), '') is not null) as has_api_key,
    s.updated_at,
    s.updated_by
  from public.ai_provider_settings s
  order by s.provider;
$$;

create or replace function public.admin_get_ai_runtime_settings(payload_provider text default 'openrouter')
returns table (
  provider text,
  enabled boolean,
  api_key text,
  model text,
  base_url text,
  updated_at timestamptz,
  updated_by text
)
language sql
security definer
set search_path = public
as $$
  select
    s.provider,
    s.enabled,
    s.api_key,
    s.model,
    s.base_url,
    s.updated_at,
    s.updated_by
  from public.ai_provider_settings s
  where s.provider = coalesce(nullif(btrim(payload_provider), ''), 'openrouter')
  limit 1;
$$;

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
  saved public.ai_provider_settings;
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
  on conflict (provider) do update
  set
    enabled = excluded.enabled,
    api_key = coalesce(excluded.api_key, settings.api_key),
    model = excluded.model,
    base_url = excluded.base_url,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning settings.* into saved;

  return query
  select
    saved.provider,
    saved.enabled,
    saved.model,
    saved.base_url,
    (nullif(btrim(coalesce(saved.api_key, '')), '') is not null) as has_api_key,
    saved.updated_at,
    saved.updated_by;
end;
$$;

select pg_notify('pgrst', 'reload schema');
