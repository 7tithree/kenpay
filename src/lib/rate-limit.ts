/**
 * Minimal in-memory fixed-window rate limiter for brute-force protection.
 * State lives in the Node process, which is fine for a single instance
 * (local dev, one App Runner container). If the app ever runs multiple
 * replicas, move this to a shared store (e.g. Redis) or the edge.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitStatus = { limited: boolean; retryAfterMs: number };

/** Is this key currently locked out? Does not consume an attempt. */
export function checkRateLimit(key: string, max: number): RateLimitStatus {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return { limited: false, retryAfterMs: 0 };
  if (b.count >= max) return { limited: true, retryAfterMs: b.resetAt - now };
  return { limited: false, retryAfterMs: 0 };
}

/** Record a failed attempt; the window starts at the first failure. */
export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    b.count += 1;
  }
  // Opportunistic cleanup so abandoned keys don't accumulate forever.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
}

/** Clear a key, e.g. after a successful login. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
