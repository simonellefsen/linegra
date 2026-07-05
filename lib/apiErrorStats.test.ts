import { describe, expect, it } from 'vitest';
import { labelApiErrorSource, mapApiErrorStats } from './apiErrorStats';

describe('apiErrorStats', () => {
  it('maps RPC payload into typed stats', () => {
    const stats = mapApiErrorStats({
      days: 7,
      totals: { hits: 5, unique_routes: 2, unique_sources: 2 },
      byRoute: [{ route: '/api/public/person/:id', hits: 3 }],
      byStatus: [{ status_code: 404, hits: 3 }],
      recent: [
        {
          recorded_at: '2026-07-05T10:00:00Z',
          source: 'public-api',
          route: '/api/public/person/missing',
          status_code: 404,
          message: 'Person not found',
        },
      ],
      aiProxy: {
        totals: { hits: 2 },
        byPurpose: [{ purpose: 'book_chapter', hits: 2 }],
        recent: [
          {
            recorded_at: '2026-07-05T09:00:00Z',
            purpose: 'book_chapter',
            model: 'openai/gpt-4o-mini',
            error: 'OpenRouter 401',
            status: 'error',
          },
        ],
      },
    });
    expect(stats.totals.hits).toBe(5);
    expect(stats.byRoute[0]?.route).toContain('person');
    expect(stats.aiProxy.totals.hits).toBe(2);
    expect(stats.aiProxy.recent[0]?.error).toContain('401');
  });

  it('labels known API error sources', () => {
    expect(labelApiErrorSource('public-api')).toBe('Public crawl API');
    expect(labelApiErrorSource('ai-proxy')).toBe('AI proxy');
  });
});
