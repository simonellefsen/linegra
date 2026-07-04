// Roadmap N Phase 3 — helpers for AI spend-cap responses from ai-proxy / Supabase.

export type AiBudgetBlockReason = 'daily_global_cap_exceeded' | 'daily_tree_cap_exceeded';

export interface AiBudgetStatus {
  allowed: boolean;
  caps_enabled?: boolean;
  reason?: AiBudgetBlockReason;
  global_spend_today?: number;
  global_cap_usd?: number | null;
  tree_spend_today?: number;
  tree_cap_usd?: number | null;
}

export const AI_BUDGET_EXCEEDED_CODE = 'AI_BUDGET_EXCEEDED';

export const parseAiBudgetStatus = (value: unknown): AiBudgetStatus | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    caps_enabled: typeof row.caps_enabled === 'boolean' ? row.caps_enabled : undefined,
    reason:
      row.reason === 'daily_global_cap_exceeded' || row.reason === 'daily_tree_cap_exceeded'
        ? row.reason
        : undefined,
    global_spend_today: typeof row.global_spend_today === 'number' ? row.global_spend_today : undefined,
    global_cap_usd:
      typeof row.global_cap_usd === 'number' ? row.global_cap_usd : row.global_cap_usd === null ? null : undefined,
    tree_spend_today: typeof row.tree_spend_today === 'number' ? row.tree_spend_today : undefined,
    tree_cap_usd:
      typeof row.tree_cap_usd === 'number' ? row.tree_cap_usd : row.tree_cap_usd === null ? null : undefined,
  };
};

export const budgetExceededMessage = (status: AiBudgetStatus): string => {
  if (status.reason === 'daily_tree_cap_exceeded') {
    return `Daily AI budget for this tree is exhausted ($${Number(status.tree_spend_today ?? 0).toFixed(4)} / $${Number(status.tree_cap_usd ?? 0).toFixed(2)}). Using offline fallback.`;
  }
  if (status.reason === 'daily_global_cap_exceeded') {
    return `Daily global AI budget is exhausted ($${Number(status.global_spend_today ?? 0).toFixed(4)} / $${Number(status.global_cap_usd ?? 0).toFixed(2)}). Using offline fallback.`;
  }
  return 'Daily AI budget exhausted. Using offline fallback.';
};
