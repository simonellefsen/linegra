import { describe, expect, it } from 'vitest';
import { labelCountryCode, labelCrawlerAgent, mapCrawlTrafficStats } from './crawlTrafficStats';

describe('crawlTrafficStats', () => {
  it('maps nested bot and visitor aggregates', () => {
    const stats = mapCrawlTrafficStats({
      days: 7,
      raw_retention_days: 14,
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
    expect(stats.rawRetentionDays).toBe(14);
    expect(stats.bot.totals.llmHits).toBe(4);
    expect(stats.bot.recent[0]?.userAgent).toBe('GPTBot/1.0');
    expect(stats.visitor.totals.hits).toBe(3);
    expect(stats.visitor.byCountry[0]?.countryCode).toBe('NO');
  });

  it('aligns unique country count with by-country buckets including Unknown', () => {
    const stats = mapCrawlTrafficStats({
      days: 7,
      visitor: {
        totals: { hits: 5, unique_countries: 2, unique_routes: 1 },
        by_country: [
          { country_code: 'NO', hits: 2 },
          { country_code: 'US', hits: 2 },
          { country_code: '??', hits: 1 },
        ],
        by_route: [],
        by_day: [],
        recent: [],
      },
    });
    expect(stats.visitor.totals.uniqueCountries).toBe(3);
  });

  it('labels known crawler buckets', () => {
    expect(labelCrawlerAgent('gptbot')).toContain('GPTBot');
    expect(labelCrawlerAgent('claudebot')).toContain('ClaudeBot');
  });

  it('labels country codes', () => {
    expect(labelCountryCode('NO')).toBe('Norway');
    expect(labelCountryCode('??')).toBe('Unknown country');
  });

  it('maps legacy flat bot RPC payload', () => {
    const stats = mapCrawlTrafficStats({
      days: 7,
      totals: { hits: 2, unique_agents: 1, llm_hits: 0 },
      by_agent: [{ agent_bucket: 'googlebot', hits: 2 }],
      by_route: [{ route: 'sitemap', hits: 2 }],
      by_day: [],
      recent: [],
    });
    expect(stats.bot.totals.hits).toBe(2);
    expect(stats.bot.byAgent[0]?.agentBucket).toBe('googlebot');
  });
});
