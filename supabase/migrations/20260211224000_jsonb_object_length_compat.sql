-- Compatibility shim for Postgres versions that do not expose jsonb_object_length(jsonb).
create or replace function public.jsonb_object_length(payload jsonb)
returns integer
language sql
immutable
strict
as $$
  select coalesce(count(*), 0)::integer
  from jsonb_object_keys(payload);
$$;
