import { describe, expect, it } from 'vitest';
import {
  buildAgentFormatBreakdowns,
  formatSharePercent,
  normalizeCrawlResponseFormat,
} from './crawlFormatBreakdown';

describe('crawlFormatBreakdown', () => {
  it('normalizes markdown aliases and unknown formats', () => {
    expect(normalizeCrawlResponseFormat('markdown')).toBe('md');
    expect(normalizeCrawlResponseFormat('HTML')).toBe('html');
    expect(normalizeCrawlResponseFormat(null)).toBe('other');
  });

  it('groups format hits per agent in display order', () => {
    const breakdowns = buildAgentFormatBreakdowns(
      [
        { agentBucket: 'gptbot', format: 'html', hits: 3 },
        { agentBucket: 'gptbot', format: 'md', hits: 1 },
        { agentBucket: 'googlebot', format: 'xml', hits: 2 },
      ],
      ['gptbot', 'googlebot']
    );

    expect(breakdowns[0]).toMatchObject({
      agentBucket: 'gptbot',
      totalHits: 4,
      formatHits: { html: 3, md: 1, json: 0, xml: 0, other: 0 },
    });
    expect(breakdowns[1]?.formatHits.xml).toBe(2);
    expect(formatSharePercent(3, 4)).toBe(75);
  });
});
