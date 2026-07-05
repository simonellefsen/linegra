/** Simple per-key token bucket for Edge middleware (best-effort per isolate). */

interface BucketState {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, BucketState>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export const checkPublicRateLimit = (
  key: string,
  options: { capacity?: number; refillPerSecond?: number } = {}
): RateLimitResult => {
  const capacity = options.capacity ?? 120;
  const refillPerSecond = options.refillPerSecond ?? 2;
  const now = Date.now();
  const existing = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsedSeconds = Math.max(0, (now - existing.updatedAt) / 1000);
  const refilled = Math.min(capacity, existing.tokens + elapsedSeconds * refillPerSecond);
  if (refilled < 1) {
    const retryAfterSeconds = Math.ceil((1 - refilled) / refillPerSecond);
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return { allowed: false, retryAfterSeconds };
  }
  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return { allowed: true };
};

export const clientIpFromRequest = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
};
