/**
 * In-memory token bucket rate limiter.
 *
 * Suitable for single-instance VPS deployment.
 * For multi-instance, replace with Redis-backed limiter.
 *
 * Default: 10 requests per minute per IP.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 10,
  refillRate: 10,
  windowMs: 60_000, // 1 minute
};

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  ip: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    buckets.set(ip, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / config.windowMs) * config.refillRate;

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true, remaining: bucket.tokens };
  }

  const retryAfterMs = config.windowMs - (elapsed % config.windowMs);
  return { allowed: false, remaining: 0, retryAfterMs };
}

/**
 * Remove stale buckets to prevent memory leaks.
 * Call periodically (e.g., every 5 minutes).
 */
export function cleanupBuckets(
  config: RateLimitConfig = DEFAULT_CONFIG,
): number {
  const staleThreshold = Date.now() - config.windowMs * 10;
  let cleaned = 0;

  for (const [ip, bucket] of buckets) {
    if (bucket.lastRefill < staleThreshold) {
      buckets.delete(ip);
      cleaned++;
    }
  }

  return cleaned;
}

/** Reset all buckets — for testing only */
export function resetBuckets(): void {
  buckets.clear();
}

// Auto-cleanup every 5 minutes (only runs in long-lived server process)
// Wrapped in typeof check to avoid issues in test/build environments
if (typeof globalThis !== 'undefined' && typeof setInterval !== 'undefined') {
  const cleanupInterval = setInterval(() => {
    cleanupBuckets();
  }, 5 * 60_000);

  // Don't prevent process exit
  if (typeof cleanupInterval === 'object' && cleanupInterval !== null && 'unref' in cleanupInterval) {
    (cleanupInterval as { unref: () => void }).unref();
  }
}
