
import { createClient } from '@supabase/supabase-js';

type RuntimeEnv = Record<string, string | undefined>;

const getRuntimeEnv = (): RuntimeEnv => {
  const envFromProcess = (globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }).process?.env ?? {};
  const envFromImport = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env as RuntimeEnv) : {};
  return { ...envFromProcess, ...envFromImport };
};

// Helper to get keys from env or localStorage fallback
const getSupabaseConfig = () => {
  const runtimeEnv = getRuntimeEnv();
  const envUrl = runtimeEnv.VITE_SUPABASE_URL ?? runtimeEnv.SUPABASE_URL;
  const envKey = runtimeEnv.VITE_SUPABASE_ANON_KEY ?? runtimeEnv.SUPABASE_ANON_KEY;
  
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('LINEGRA_SUPABASE_URL') : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('LINEGRA_SUPABASE_ANON_KEY') : null;

  return {
    url: envUrl || localUrl || 'https://placeholder-project.supabase.co',
    key: envKey || localKey || 'placeholder-key',
    isReal: !!(envUrl || localUrl) && !!(envKey || localKey)
  };
};

const config = getSupabaseConfig();

export const supabase = createClient(config.url, config.key);

export const isSupabaseConfigured = () => getSupabaseConfig().isReal;

export const getActiveConfig = () => getSupabaseConfig();
