import { describe, expect, it } from 'vitest';
import { classifyReferrer } from './crawlReferrer';

describe('crawlReferrer', () => {
  it('classifies search, AI, direct, and other referrers', () => {
    expect(classifyReferrer(null)).toBe('direct');
    expect(classifyReferrer('https://www.google.com/search?q=genealogy')).toBe('google');
    expect(classifyReferrer('https://www.bing.com/search')).toBe('bing');
    expect(classifyReferrer('https://chatgpt.com/')).toBe('ai_assistant');
    expect(classifyReferrer('https://example.com/blog')).toBe('other');
  });
});
