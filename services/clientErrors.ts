import { mapClientErrorStats, type ClientErrorStats } from '../lib/clientErrorStats';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type { ClientErrorStats } from '../lib/clientErrorStats';

export const fetchAdminClientErrorStats = async (days = 30): Promise<ClientErrorStats> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_get_client_error_stats', {
    payload_days: days,
  });
  if (error) throw new Error(error.message);
  return mapClientErrorStats(data);
};
