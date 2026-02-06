
import { createClient } from '@supabase/supabase-js';

// Helper to get keys from env or localStorage fallback
const getSupabaseConfig = () => {
  const envUrl = (process.env as any).SUPABASE_URL;
  const envKey = (process.env as any).SUPABASE_ANON_KEY;
  
  const localUrl = localStorage.getItem('LINEGRA_SUPABASE_URL');
  const localKey = localStorage.getItem('LINEGRA_SUPABASE_ANON_KEY');

  return {
    url: envUrl || localUrl || 'https://placeholder-project.supabase.co',
    key: envKey || localKey || 'placeholder-key',
    isReal: !!(envUrl || localUrl) && !!(envKey || localKey)
  };
};

const config = getSupabaseConfig();

export const supabase = createClient(config.url, config.key);

export const isSupabaseConfigured = () => {
  return getSupabaseConfig().isReal;
};

export const getActiveConfig = () => getSupabaseConfig();
