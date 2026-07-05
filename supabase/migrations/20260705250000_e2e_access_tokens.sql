-- Roadmap X — superadmin-minted E2E access tokens (redeemed server-side for CI Playwright).

create table if not exists public.e2e_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'default',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists e2e_access_tokens_expires_idx
  on public.e2e_access_tokens (expires_at desc);

create index if not exists e2e_access_tokens_active_idx
  on public.e2e_access_tokens (expires_at)
  where revoked_at is null;

alter table public.e2e_access_tokens enable row level security;

drop policy if exists e2e_access_tokens_select on public.e2e_access_tokens;
create policy e2e_access_tokens_select on public.e2e_access_tokens
  for select using (public.is_superadmin());

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

create or replace function public.admin_list_e2e_access_tokens()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_superadmin();

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'label', t.label,
          'expiresAt', t.expires_at,
          'revokedAt', t.revoked_at,
          'lastUsedAt', t.last_used_at,
          'createdAt', t.created_at
        )
        order by t.created_at desc
      )
      from public.e2e_access_tokens t
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_revoke_e2e_access_token(payload_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_superadmin();

  update public.e2e_access_tokens
  set revoked_at = coalesce(revoked_at, now())
  where id = payload_id;
end;
$$;

revoke all on function public.consume_e2e_access_token(text) from public;
revoke all on function public.admin_mint_e2e_access_token(text, int) from public;
revoke all on function public.admin_list_e2e_access_tokens() from public;
revoke all on function public.admin_revoke_e2e_access_token(uuid) from public;

grant execute on function public.consume_e2e_access_token(text) to service_role;
grant execute on function public.admin_mint_e2e_access_token(text, int) to authenticated;
grant execute on function public.admin_list_e2e_access_tokens() to authenticated;
grant execute on function public.admin_revoke_e2e_access_token(uuid) to authenticated;
