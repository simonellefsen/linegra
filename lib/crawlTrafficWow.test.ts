import { describe, expect, it } from 'vitest';
import { formatWeekOverWeekDelta } from './crawlTrafficWow';

describe('crawlTrafficWow', () => {
  it('formats positive, negative, and new-week deltas', () => {
    expect(formatWeekOverWeekDelta({ currentWeek: 11, priorWeek: 10 }).label).toBe('+10% vs last week');
    expect(formatWeekOverWeekDelta({ currentWeek: 4, priorWeek: 8 }).label).toBe('-50% vs last week');
    expect(formatWeekOverWeekDelta({ currentWeek: 3, priorWeek: 0 }).label).toBe('new this week');
  });
});
