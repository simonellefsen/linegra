
import { createClient } from '@supabase/supabase-js';

type RuntimeEnv = Record<string, string | undefined>;

const getRuntimeEnv = (): RuntimeEnv => {
  const envFromProcess = (globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }).process?.env ?? {};
  const envFromImport = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as RuntimeEnv) : {};
  return { ...envFromProcess, ...envFromImport };
};

const getSupabaseConfig = () => {
  const runtimeEnv = getRuntimeEnv();
  const envUrl = runtimeEnv.VITE_SUPABASE_URL ?? runtimeEnv.SUPABASE_URL ?? '';
  const envKey = runtimeEnv.VITE_SUPABASE_ANON_KEY ?? runtimeEnv.SUPABASE_ANON_KEY ?? '';

  return {
    url: envUrl || 'https://placeholder.invalid-supabase.local',
    key: envKey || 'placeholder-key',
    isReal: Boolean(envUrl && envKey)
  };
};

const config = getSupabaseConfig();

export const isSupabaseConfigured = () => config.isReal;

if (!isSupabaseConfigured()) {
  console.warn('Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
}

export const supabase = createClient(config.url, config.key);

export const getActiveConfig = () => getSupabaseConfig();
