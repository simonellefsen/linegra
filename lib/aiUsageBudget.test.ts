import { describe, expect, it } from 'vitest';
import { budgetExceededMessage, parseAiBudgetStatus } from './aiUsageBudget';

describe('aiUsageBudget', () => {
  it('parses blocked tree budget responses', () => {
    const status = parseAiBudgetStatus({
      allowed: false,
      reason: 'daily_tree_cap_exceeded',
      tree_spend_today: 1.02,
      tree_cap_usd: 1,
    });
    expect(status?.allowed).toBe(false);
    expect(status?.reason).toBe('daily_tree_cap_exceeded');
    expect(budgetExceededMessage(status!)).toContain('this tree');
  });

  it('parses allowed responses', () => {
    const status = parseAiBudgetStatus({ allowed: true, caps_enabled: true });
    expect(status?.allowed).toBe(true);
  });
});
