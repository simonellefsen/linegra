import { describe, expect, it } from 'vitest';
import { labelCrawlerAgent, mapCrawlTrafficStats } from './crawlTrafficStats';

describe('crawlTrafficStats', () => {
  it('maps RPC aggregates into panel rows', () => {
    const stats = mapCrawlTrafficStats({
      days: 7,
      totals: { hits: 12, unique_agents: 3, llm_hits: 4 },
      by_agent: [{ agent_bucket: 'gptbot', hits: 4, last_seen: '2026-07-04T08:00:00Z' }],
      by_route: [{ route: 'person', hits: 8 }],
      by_day: [{ day: '2026-07-04', hits: 5 }],
      recent: [
        {
          recorded_at: '2026-07-04T08:00:00Z',
          route: 'person',
          agent_bucket: 'gptbot',
          resource_id: '11111111-1111-4111-8111-111111111111',
          response_format: 'html',
        },
      ],
    });
    expect(stats.totals.llmHits).toBe(4);
    expect(stats.byAgent[0]?.agentBucket).toBe('gptbot');
    expect(stats.recent[0]?.responseFormat).toBe('html');
  });

  it('labels known crawler buckets', () => {
    expect(labelCrawlerAgent('gptbot')).toContain('GPTBot');
  });
});
