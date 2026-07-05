import { describe, expect, it } from 'vitest';
import { formatCoveragePersonName, mapCrawlCoverageStats } from './crawlCoverage';

describe('crawlCoverage', () => {
  it('maps tree coverage and never-crawled samples', () => {
    const stats = mapCrawlCoverageStats({
      days: 30,
      trees: [
        {
          tree_id: '22222222-2222-4222-8222-222222222222',
          tree_name: 'Lindau tree',
          total_person_urls: 100,
          crawled_person_urls: 38,
          coverage_percent: 38,
          never_crawled: [
            { person_id: '11111111-1111-4111-8111-111111111111', first_name: 'Anna', last_name: 'King' },
          ],
        },
      ],
      by_agent_tree: [],
    });
    expect(stats.trees[0]?.coveragePercent).toBe(38);
    expect(formatCoveragePersonName(stats.trees[0]!.neverCrawled[0]!)).toBe('Anna King');
  });
});
