// U18e — minute-bucket idempotency for public crawl telemetry (middleware double-fire).

export const normalizeCrawlResourceKey = (resourceId?: string | null): string | null => {
  const trimmed = resourceId?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
};

/** UTC minute bucket used by record_public_crawl_event dedupe. */
export const crawlEventMinuteBucket = (timestamp: Date): string =>
  timestamp.toISOString().slice(0, 16);

export const crawlEventsAreDuplicates = (
  left: {
    route: string;
    resourceKey?: string | null;
    userAgent?: string | null;
    recordedAt: Date;
  },
  right: {
    route: string;
    resourceKey?: string | null;
    userAgent?: string | null;
    recordedAt: Date;
  }
): boolean =>
  left.route === right.route &&
  (left.resourceKey ?? '') === (right.resourceKey ?? '') &&
  (left.userAgent ?? '') === (right.userAgent ?? '') &&
  crawlEventMinuteBucket(left.recordedAt) === crawlEventMinuteBucket(right.recordedAt);
