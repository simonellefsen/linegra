import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export interface AiUsageTotals {
  calls: number;
  ok: number;
  errors: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_estimate: number;
}

export interface AiUsageBucket {
  purpose?: string;
  tree_id?: string | null;
  tree_name?: string | null;
  calls: number;
  total_tokens: number;
  cost_estimate: number;
}

export interface AiUsageSummary {
  days: number;
  since: string;
  totals: AiUsageTotals;
  byPurpose: AiUsageBucket[];
  byTree: AiUsageBucket[];
}

export const fetchAiUsageSummary = async (days = 30): Promise<AiUsageSummary> => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase credentials are missing.');
  }
  const { data, error } = await supabase.rpc('admin_get_ai_usage_summary', { payload_days: days });
  if (error) throw new Error(error.message);
  return data as AiUsageSummary;
};
