import { mapApiErrorStats, type ApiErrorStats } from '../lib/apiErrorStats';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type { ApiErrorStats } from '../lib/apiErrorStats';

export const fetchAdminApiErrorStats = async (days = 30): Promise<ApiErrorStats> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_get_api_error_stats', {
    payload_days: days,
  });
  if (error) throw new Error(error.message);
  return mapApiErrorStats(data);
};
