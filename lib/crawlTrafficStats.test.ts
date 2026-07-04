import { describe, expect, it } from 'vitest';
import { labelCountryCode, labelCrawlerAgent, mapCrawlTrafficStats } from './crawlTrafficStats';

describe('crawlTrafficStats', () => {
  it('maps nested bot and visitor aggregates', () => {
    const stats = mapCrawlTrafficStats({
      days: 7,
      agent_filter: 'googlebot',
      bot: {
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
            user_agent: 'GPTBot/1.0',
          },
        ],
      },
      visitor: {
        totals: { hits: 3, unique_countries: 2, unique_routes: 2 },
        by_country: [{ country_code: 'NO', hits: 2, last_seen: '2026-07-04T09:00:00Z' }],
        by_route: [{ route: 'tree', hits: 2 }],
        by_day: [{ day: '2026-07-04', hits: 3 }],
        recent: [
          {
            recorded_at: '2026-07-04T09:00:00Z',
            route: 'tree',
            country_code: 'NO',
            city: 'Oslo',
            resource_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      },
    });
    expect(stats.agentFilter).toBe('googlebot');
    expect(stats.bot.totals.llmHits).toBe(4);
    expect(stats.bot.recent[0]?.userAgent).toBe('GPTBot/1.0');
    expect(stats.visitor.totals.hits).toBe(3);
    expect(stats.visitor.byCountry[0]?.countryCode).toBe('NO');
  });

  it('labels known crawler buckets', () => {
    expect(labelCrawlerAgent('gptbot')).toContain('GPTBot');
    expect(labelCrawlerAgent('claudebot')).toContain('ClaudeBot');
  });

  it('labels country codes', () => {
    expect(labelCountryCode('NO')).toBe('Norway');
    expect(labelCountryCode('??')).toBe('Unknown country');
  });
});
