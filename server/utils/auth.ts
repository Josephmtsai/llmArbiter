import { createHash } from 'node:crypto'

import { bufferEquals } from './constantTime'

/**
 * Minimum length for `NUXT_SESSION_PASSWORD`, and the default for any caller
 * that does not say otherwise. 32 is not ours to lower: nuxt-auth-utils uses
 * this value as the iron-webcrypto seal key and requires 32 characters itself.
 */
export const MIN_SECRET_LENGTH = 32

/**
 * Minimum length for `NUXT_AUTH_PASSWORD`. Deliberately lower than
 * MIN_SECRET_LENGTH: this one is a human-typed login password, and the login
 * endpoint is rate limited to 5 attempts per IP per minute
 * (`server/api/auth/login.post.ts`), which is what makes 8 defensible here.
 * That rate limiter is a load-bearing part of this number -- see spec
 * `deploy-recovery`, AD-2 and R-1/R-3.
 */
export const MIN_AUTH_PASSWORD_LENGTH = 8

/**
 * Fragments of the values shipped in `.env.example`, lower-cased. They are
 * public by definition, so a server booted with one of them is effectively
 * unauthenticated no matter how long the string is. The superseded example
 * value is kept so a deployment that copied the older file is still caught.
 *
 * Matched as substrings against the trimmed, lower-cased secret, because the
 * realistic failure is a copy-paste that picked up an editor's case change or a
 * trailing newline, or that appended a suffix to the placeholder. That is the
 * whole scope of this check: it catches an accident, and an operator who wants
 * to run with a weak secret can trivially pick one that is not on this list.
 */
export const PLACEHOLDER_SECRET_FRAGMENTS: readonly string[] = [
  'replace-me-with-openssl-rand-hex-32-output',
  'change-me-at-least-32-characters-long',
  'change-me',
  'replace-me',
  'your-secret-here',
]

/** True when `value` looks like an unedited `.env.example` placeholder. */
export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return PLACEHOLDER_SECRET_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * One-entry memo for the configured password's digest. `expected` comes from
 * runtimeConfig and is the same string on every request, so re-hashing it per
 * login attempt is redundant work. This is a cost optimisation, not a security
 * control -- the unmemoised version leaked nothing about the password content.
 */
let expectedMemo: { source: string; digest: Buffer } | null = null

function expectedDigest(expected: string): Buffer {
  if (expectedMemo === null || expectedMemo.source !== expected) {
    expectedMemo = { source: expected, digest: sha256(expected) }
  }
  return expectedMemo.digest
}

/** Test seam: drops the memoised digest so each case starts clean. */
export function resetExpectedDigestCache(): void {
  expectedMemo = null
}

/**
 * Constant-time password comparison.
 *
 * `bufferEquals` throws when the two buffers differ in length, and returning
 * early on a length mismatch would itself leak the expected length. Hashing both
 * sides to a fixed 32-byte SHA-256 digest first removes that side channel.
 */
export function verifyLoginPassword(input: string, expected: string): boolean {
  return bufferEquals(sha256(input), expectedDigest(expected))
}

/**
 * Throws unless `value` is a usable secret. Shared by the startup assertion so
 * every secret goes through the same two gates -- length, then placeholder.
 *
 * `minLength` defaults to the *stricter* floor on purpose: a future caller that
 * forgets to pass one gets 32, not 8, so the failure direction is safe.
 */
export function assertStrongSecret(
  name: string,
  value: unknown,
  minLength: number = MIN_SECRET_LENGTH,
): void {
  // Measured after trim. The raw length would wave through a secret that is
  // mostly padding; at the old floor of 32 that took deliberate effort, at 8 it
  // is one stray copy-paste away. Only the *measurement* is trimmed -- the
  // stored value is left untouched, because trimming it would silently change
  // what an existing deployment has to type (spec deploy-recovery, R-2).
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new Error(
      `${name} must be set and at least ${minLength} characters long. See .env.example.`,
    )
  }
  if (isPlaceholderSecret(value)) {
    throw new Error(
      `${name} is still set to the .env.example placeholder. ` +
        'Generate a real secret with: openssl rand -hex 32',
    )
  }
}

function isIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isIpv6(value: string): boolean {
  // Deliberately loose: this only has to reject things that are not addresses
  // at all, so that a forged header cannot smuggle an arbitrary bucket key.
  if (!value.includes(':')) return false
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false
  const tail = value.slice(value.lastIndexOf(':') + 1)
  return tail === '' || /^[0-9a-fA-F]{1,4}$/.test(tail) || isIpv4(tail)
}

export function isIpAddress(value: string): boolean {
  return isIpv4(value) || isIpv6(value)
}

/**
 * Extracts the client address from an `X-Forwarded-For` header value.
 *
 * Each proxy *appends* the address it received the request from, so the
 * rightmost entry is the one written by the hop closest to us -- the only entry
 * a client cannot forge. h3's `getRequestIP(event, { xForwardedFor: true })`
 * takes the leftmost entry instead, which is entirely client-supplied: sending
 * a fresh fake prefix per attempt would give every request its own bucket.
 *
 * Returns undefined when the header is absent or its last entry is not an
 * address, so the caller falls back instead of keying a bucket on junk.
 */
export function clientIpFromForwardedFor(header: string | undefined | null): string | undefined {
  if (typeof header !== 'string') return undefined
  const last = header.split(',').pop()?.trim()
  if (!last || !isIpAddress(last)) return undefined
  return last
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult
  reset(): void
  /** Live bucket count. Exposed so tests can observe eviction directly. */
  readonly size: number
}

/**
 * Upper bound on tracked keys. Far above the real client count for this app; it
 * exists so a burst of distinct addresses cannot grow the Map without limit.
 */
export const DEFAULT_MAX_KEYS = 10_000

/**
 * Fixed-window in-memory rate limiter.
 *
 * Sized for the single Nitro instance this app runs on (spec `auth-hardening`,
 * assumption 1).
 */
export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  maxKeys?: number
}): RateLimiter {
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS
  const buckets = new Map<string, { count: number; windowStart: number }>()
  let lastSweep = Number.NEGATIVE_INFINITY

  function sweep(now: number): void {
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= opts.windowMs) buckets.delete(key)
    }
    lastSweep = now
  }

  function denied(now: number, windowStart: number): RateLimitResult {
    const retryAfterSec = Math.ceil((windowStart + opts.windowMs - now) / 1000)
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) }
  }

  return {
    hit(key, now = Date.now()) {
      // Sweeping on every hit made each request O(bucket count), which is the
      // wrong shape for the endpoint an attacker floods. Once per window bounds
      // growth just as well; a bucket that survives until then is restarted by
      // the staleness check below, so counts never carry across windows.
      if (now - lastSweep >= opts.windowMs) sweep(now)

      const bucket = buckets.get(key)
      if (bucket && now - bucket.windowStart < opts.windowMs) {
        bucket.count += 1
        if (bucket.count > opts.limit) return denied(now, bucket.windowStart)
        return { allowed: true, retryAfterSec: 0 }
      }

      if (!bucket && buckets.size >= maxKeys) {
        // No second sweep here. The throttled one above is the only reclaim
        // path, deliberately: sweeping on this branch is an O(maxKeys) scan
        // that an attacker gets to trigger on every request once the table is
        // full, which is the exact cost the throttle exists to bound.
        //
        // Fail closed. A full table means this key cannot be counted, and a
        // login endpoint that quietly stops rate limiting is worse than one
        // that is briefly unavailable. The table drains at the next sweep, so
        // "briefly" is at most one window.
        return denied(now, now)
      }

      buckets.set(key, { count: 1, windowStart: now })
      return { allowed: true, retryAfterSec: 0 }
    },
    reset() {
      buckets.clear()
      lastSweep = Number.NEGATIVE_INFINITY
    },
    get size() {
      return buckets.size
    },
  }
}
