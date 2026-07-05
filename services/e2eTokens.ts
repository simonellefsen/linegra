import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface E2eAccessTokenRow {
  id: string;
  label: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface MintedE2eAccessToken {
  id: string;
  token: string;
  label: string;
  expiresAt: string;
}

const mapRow = (row: Record<string, unknown>): E2eAccessTokenRow => ({
  id: String(row.id),
  label: String(row.label ?? ''),
  expiresAt: String(row.expiresAt ?? row.expires_at ?? ''),
  revokedAt: row.revokedAt ? String(row.revokedAt) : row.revoked_at ? String(row.revoked_at) : null,
  lastUsedAt: row.lastUsedAt ? String(row.lastUsedAt) : row.last_used_at ? String(row.last_used_at) : null,
  createdAt: String(row.createdAt ?? row.created_at ?? ''),
});

export const fetchE2eAccessTokens = async (): Promise<E2eAccessTokenRow[]> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_list_e2e_access_tokens');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapRow(row as Record<string, unknown>));
};

export const mintE2eAccessToken = async (
  label: string,
  days = 90
): Promise<MintedE2eAccessToken> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_mint_e2e_access_token', {
    payload_label: label,
    payload_days: days,
  });
  if (error) throw new Error(error.message);
  const payload = data as Record<string, unknown>;
  return {
    id: String(payload.id),
    token: String(payload.token),
    label: String(payload.label ?? label),
    expiresAt: String(payload.expiresAt ?? payload.expires_at ?? ''),
  };
};

export const revokeE2eAccessToken = async (id: string): Promise<void> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { error } = await supabase.rpc('admin_revoke_e2e_access_token', { payload_id: id });
  if (error) throw new Error(error.message);
};
