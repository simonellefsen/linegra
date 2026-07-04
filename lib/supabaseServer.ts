// Server-side Supabase client for Vercel API routes (anon key + RLS).

import { createClient } from '@supabase/supabase-js';

export const createServerSupabase = () => {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const env = runtime.process?.env ?? {};
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key =
    env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY for public crawl APIs.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
