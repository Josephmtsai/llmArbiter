import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time password comparison.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, and returning
 * early on a length mismatch would itself leak the expected length. Hashing both
 * sides to a fixed 32-byte SHA-256 digest first removes that side channel.
 */
export function verifyLoginPassword(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult
  reset(): void
}

/**
 * Fixed-window in-memory rate limiter.
 *
 * Sized for the single Nitro instance this app runs on (spec `auth-hardening`,
 * assumption 1). Expired buckets are dropped on every `hit`, so the Map cannot
 * grow without bound as client IPs churn.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>()

  return {
    hit(key, now = Date.now()) {
      for (const [k, b] of buckets) {
        if (now - b.windowStart >= opts.windowMs) buckets.delete(k)
      }

      const bucket = buckets.get(key)
      if (!bucket) {
        buckets.set(key, { count: 1, windowStart: now })
        return { allowed: true, retryAfterSec: 0 }
      }

      bucket.count += 1
      if (bucket.count > opts.limit) {
        const retryAfterSec = Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000)
        return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) }
      }
      return { allowed: true, retryAfterSec: 0 }
    },
    reset() {
      buckets.clear()
    },
  }
}
