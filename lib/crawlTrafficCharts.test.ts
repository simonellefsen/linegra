import { describe, expect, it } from 'vitest';
import {
  buildOverlayDaySeries,
  listUtcDaysInWindow,
  overlayBarWidthPercent,
  overlayChartAxisMax,
} from './crawlTrafficCharts';

describe('crawlTrafficCharts', () => {
  const anchor = new Date('2026-07-05T15:30:00.000Z');

  it('lists every UTC day in the window', () => {
    expect(listUtcDaysInWindow(3, anchor)).toEqual(['2026-07-03', '2026-07-04', '2026-07-05']);
  });

  it('fills missing days with zero hits', () => {
    const series = buildOverlayDaySeries(
      3,
      [{ day: '2026-07-05', hits: 4 }],
      [{ day: '2026-07-04', hits: 2 }],
      anchor
    );
    expect(series).toEqual([
      { day: '2026-07-05', botHits: 4, visitorHits: 0 },
      { day: '2026-07-04', botHits: 0, visitorHits: 2 },
      { day: '2026-07-03', botHits: 0, visitorHits: 0 },
    ]);
  });

  it('uses a shared axis max and zero-width bars for empty days', () => {
    const series = buildOverlayDaySeries(2, [{ day: '2026-07-05', hits: 1 }], [], anchor);
    expect(overlayChartAxisMax(series)).toBe(1);
    expect(overlayBarWidthPercent(1, 1)).toBe(100);
    expect(overlayBarWidthPercent(0, 1)).toBe(0);
  });
});
