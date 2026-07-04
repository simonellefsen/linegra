import { mapCrawlTrafficStats, type CrawlTrafficStats } from '../lib/crawlTrafficStats';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type { CrawlTrafficStats } from '../lib/crawlTrafficStats';

export interface FetchAdminCrawlTrafficOptions {
  days?: number;
  agentFilter?: string | null;
}

export const fetchAdminCrawlTrafficStats = async (
  days = 30,
  options: FetchAdminCrawlTrafficOptions = {}
): Promise<CrawlTrafficStats> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_get_crawl_traffic_stats', {
    payload_days: days,
    payload_agent_filter: options.agentFilter ?? null,
  });
  if (error) throw new Error(error.message);
  return mapCrawlTrafficStats(data);
};
