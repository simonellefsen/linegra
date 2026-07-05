-- Supabase installs pgcrypto in the extensions schema; security definer functions
-- with search_path = public cannot see gen_random_bytes / digest without it.

create or replace function public.consume_e2e_access_token(payload_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := trim(coalesce(payload_token, ''));
  token_digest text;
  token_id uuid;
begin
  if normalized = '' or normalized not like 'lg_e2e_%' then
    return null;
  end if;

  token_digest := encode(digest(normalized, 'sha256'), 'hex');

  update public.e2e_access_tokens
  set last_used_at = now()
  where token_hash = token_digest
    and revoked_at is null
    and expires_at > now()
  returning id into token_id;

  return token_id;
end;
$$;

create or replace function public.admin_mint_e2e_access_token(
  payload_label text default 'CI',
  payload_days int default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_label text := left(coalesce(nullif(trim(payload_label), ''), 'CI'), 120);
  window_days int := greatest(coalesce(payload_days, 90), 1);
  raw_token text;
  token_digest text;
  token_id uuid;
  expires timestamptz := now() + (window_days || ' days')::interval;
begin
  perform public.assert_superadmin();

  raw_token := 'lg_e2e_' || encode(gen_random_bytes(24), 'hex');
  token_digest := encode(digest(raw_token, 'sha256'), 'hex');

  insert into public.e2e_access_tokens (token_hash, label, expires_at, created_by)
  values (token_digest, normalized_label, expires, auth.uid())
  returning id into token_id;

  return jsonb_build_object(
    'id', token_id,
    'token', raw_token,
    'label', normalized_label,
    'expiresAt', expires
  );
end;
$$;
