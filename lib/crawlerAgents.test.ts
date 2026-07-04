import { describe, expect, it } from 'vitest';
import { classifyCrawlerUserAgent, isCrawlerUserAgent } from './crawlerAgents';

describe('crawlerAgents', () => {
  it('detects major crawlers', () => {
    expect(isCrawlerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isCrawlerUserAgent('GPTBot/1.0')).toBe(true);
    expect(isCrawlerUserAgent('Mozilla/5.0 Chrome/120')).toBe(false);
  });

  it('classifies agent buckets', () => {
    expect(classifyCrawlerUserAgent('GPTBot/1.0')).toBe('gptbot');
    expect(classifyCrawlerUserAgent('Mozilla/5.0 Chrome/120')).toBe('browser');
  });
});
