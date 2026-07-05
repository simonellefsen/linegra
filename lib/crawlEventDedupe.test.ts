import { describe, expect, it } from 'vitest';
import {
  crawlEventMinuteBucket,
  crawlEventsAreDuplicates,
  normalizeCrawlResourceKey,
} from './crawlEventDedupe';

describe('crawlEventDedupe', () => {
  it('normalizes slug and uuid resource keys', () => {
    expect(normalizeCrawlResourceKey('  pernille-gether-gamby-a1b2c3d4  ')).toBe(
      'pernille-gether-gamby-a1b2c3d4'
    );
    expect(normalizeCrawlResourceKey('')).toBeNull();
  });

  it('treats same-minute identical hits as duplicates', () => {
    const base = {
      route: 'person',
      resourceKey: 'pernille-gether-gamby-a1b2c3d4',
      userAgent: 'Mozilla/5.0',
      recordedAt: new Date('2026-07-05T12:27:56.123Z'),
    };
    const duplicate = {
      ...base,
      recordedAt: new Date('2026-07-05T12:27:56.987Z'),
    };
    expect(crawlEventsAreDuplicates(base, duplicate)).toBe(true);
    expect(crawlEventMinuteBucket(base.recordedAt)).toBe('2026-07-05T12:27');
  });

  it('does not dedupe different routes or minutes', () => {
    const first = {
      route: 'person',
      resourceKey: 'slug-a',
      userAgent: 'Mozilla/5.0',
      recordedAt: new Date('2026-07-05T12:27:56Z'),
    };
    expect(
      crawlEventsAreDuplicates(first, {
        ...first,
        route: 'tree',
      })
    ).toBe(false);
    expect(
      crawlEventsAreDuplicates(first, {
        ...first,
        recordedAt: new Date('2026-07-05T12:28:01Z'),
      })
    ).toBe(false);
  });
});
