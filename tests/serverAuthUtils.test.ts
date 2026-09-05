import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertStrongSecret,
  clientIpFromForwardedFor,
  createRateLimiter,
  isIpAddress,
  resetExpectedDigestCache,
  verifyLoginPassword,
} from '../server/utils/auth'
import { bufferEquals } from '../server/utils/constantTime'

// Spied, not replaced: the real comparison still runs, but the test can assert
// that `verifyLoginPassword` goes through it at all. Without this seam, swapping
// the body for `input === expected` passes every other case in this file.
// (Vitest cannot mock `node:crypto` itself from inside a source module, which is
// why server/utils/constantTime.ts exists as a separate first-party file.)
vi.mock('../server/utils/constantTime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/constantTime')>()
  return { bufferEquals: vi.fn(actual.bufferEquals) }
})

const WINDOW_MS = 60_000
const T0 = 1_700_000_000_000

function newLimiter() {
  return createRateLimiter({ limit: 5, windowMs: WINDOW_MS })
}

beforeEach(() => {
  resetExpectedDigestCache()
  vi.mocked(bufferEquals).mockClear()
})

describe('verifyLoginPassword', () => {
  it('accepts an identical password (AC-1.1)', () => {
    expect(
      verifyLoginPassword('correct-horse-battery-staple', 'correct-horse-battery-staple'),
    ).toBe(true)
  })

  it('accepts a 32+ character secret unchanged (AC-1.1)', () => {
    const secret = 'a'.repeat(48)
    expect(verifyLoginPassword(secret, secret)).toBe(true)
  })

  it.each([
    ['same length, different content', 'aaaaaaaa', 'aaaaaaab'],
    ['input shorter than expected', 'short', 'a-much-longer-expected-password'],
    ['input longer than expected', 'a-much-longer-supplied-password', 'short'],
    ['empty input', '', 'expected-password'],
    ['empty expected', 'supplied-password', ''],
    ['differing only in case', 'A', 'a'],
  ])('rejects %s without throwing (AC-1.2)', (_label, input, expected) => {
    expect(() => verifyLoginPassword(input, expected)).not.toThrow()
    expect(verifyLoginPassword(input, expected)).toBe(false)
  })

  it('treats two empty strings as equal, so callers must reject empty separately', () => {
    // Documents why login.post.ts rejects an empty password before comparing:
    // an unset NUXT_AUTH_PASSWORD would otherwise match an empty submission.
    expect(verifyLoginPassword('', '')).toBe(true)
  })

  it('decides through the constant-time comparison, not === (AC-1.9)', () => {
    // Lengths deliberately differ: a naive implementation would have to branch
    // on that, and `bufferEquals` throws outright on unequal buffers.
    expect(verifyLoginPassword('short', 'a-much-longer-expected-password')).toBe(false)

    expect(bufferEquals).toHaveBeenCalledTimes(1)
    const [left, right] = vi.mocked(bufferEquals).mock.calls[0]
    // Both sides arrive as fixed-width digests, so no length is ever leaked.
    expect(left).toHaveLength(32)
    expect(right).toHaveLength(32)
    expect(Buffer.compare(left, right)).not.toBe(0)
  })

  it('passes matching digests through for the correct password (AC-1.9)', () => {
    expect(verifyLoginPassword('the-secret', 'the-secret')).toBe(true)

    const [left, right] = vi.mocked(bufferEquals).mock.calls[0]
    expect(Buffer.compare(left, right)).toBe(0)
  })

  it('hashes the configured password once across attempts (AC-1.10)', () => {
    // Buffer identity is the observable effect of the memo: the same digest
    // object is handed to the comparison on every attempt, rather than a fresh
    // one hashed per request.
    verifyLoginPassword('first-guess', 'the-configured-secret')
    verifyLoginPassword('second-guess', 'the-configured-secret')

    const calls = vi.mocked(bufferEquals).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1]).toBe(calls[1][1])
    // The submitted password is hashed fresh each time, as it must be.
    expect(calls[0][0]).not.toBe(calls[1][0])
  })

  it('re-hashes when the configured password changes (AC-1.10)', () => {
    verifyLoginPassword('guess', 'first-secret')
    // A stale memo here would keep authenticating against the previous secret.
    expect(verifyLoginPassword('second-secret', 'second-secret')).toBe(true)
    expect(verifyLoginPassword('first-secret', 'second-secret')).toBe(false)

    const calls = vi.mocked(bufferEquals).mock.calls
    expect(calls[0][1]).not.toBe(calls[1][1])
  })
})

describe('assertStrongSecret', () => {
  it('accepts a 32+ character secret that is not a placeholder (AC-3.1)', () => {
    expect(() => assertStrongSecret('NUXT_AUTH_PASSWORD', 'x'.repeat(64))).not.toThrow()
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345],
    ['an empty string', ''],
    ['a 31 character string', 'a'.repeat(31)],
  ])('rejects %s (AC-3.2)', (_label, value) => {
    expect(() => assertStrongSecret('NUXT_AUTH_PASSWORD', value)).toThrow(
      /must be set and at least 32 characters long/,
    )
  })

  it.each(['replace-me-with-openssl-rand-hex-32-output', 'change-me-at-least-32-characters-long'])(
    'rejects the .env.example placeholder %s (AC-3.3)',
    (value) => {
      // Long enough to clear the length gate, and public in the repo, so the
      // length check alone would wave a wide-open server straight through.
      expect(value.length).toBeGreaterThanOrEqual(32)
      expect(() => assertStrongSecret('NUXT_AUTH_PASSWORD', value)).toThrow(/placeholder/)
    },
  )

  it('names the offending variable in the message (AC-3.4)', () => {
    expect(() => assertStrongSecret('NUXT_SESSION_PASSWORD', 'short')).toThrow(
      /^NUXT_SESSION_PASSWORD /,
    )
  })
})

describe('isIpAddress', () => {
  it.each(['1.2.3.4', '255.255.255.255', '0.0.0.0', '::1', '2001:db8::1', '::ffff:1.2.3.4'])(
    'accepts %s',
    (value) => {
      expect(isIpAddress(value)).toBe(true)
    },
  )

  it.each([
    '',
    'localhost',
    '1.2.3',
    '1.2.3.4.5',
    '256.1.1.1',
    'evil.com',
    '1.2.3.4;drop',
    'zz::1',
  ])('rejects %s', (value) => {
    expect(isIpAddress(value)).toBe(false)
  })
})

describe('clientIpFromForwardedFor', () => {
  it('takes the rightmost entry, which the nearest proxy wrote (AC-2.1)', () => {
    // Only the last hop is trustworthy: everything to its left was supplied by
    // the client or by proxies further out.
    expect(clientIpFromForwardedFor('9.9.9.9, 8.8.8.8, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('ignores a forged prefix entirely (AC-2.1)', () => {
    expect(clientIpFromForwardedFor('not-an-ip, 1.1.1.1, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('handles a single-entry header (AC-2.1)', () => {
    expect(clientIpFromForwardedFor('203.0.113.7')).toBe('203.0.113.7')
  })

  it('tolerates surrounding whitespace (AC-2.1)', () => {
    expect(clientIpFromForwardedFor('  1.1.1.1 ,  203.0.113.7  ')).toBe('203.0.113.7')
  })

  it.each([
    ['an absent header', undefined],
    ['a null header', null],
    ['an empty header', ''],
    ['a trailing comma', '203.0.113.7,'],
    ['a non-address last entry', '203.0.113.7, evil.com'],
    ['a whole-header junk value', 'unknown'],
  ])('returns undefined for %s so the caller falls back (AC-2.2)', (_label, header) => {
    expect(clientIpFromForwardedFor(header)).toBeUndefined()
  })
})

describe('createRateLimiter', () => {
  it('allows the first five hits in one window (AC-1.3)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.hit('1.2.3.4', T0 + i * 100)).toEqual({ allowed: true, retryAfterSec: 0 })
    }
  })

  it('rejects the sixth hit with a sane Retry-After (AC-1.4)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) limiter.hit('1.2.3.4', T0 + i * 100)

    const sixth = limiter.hit('1.2.3.4', T0 + 500)
    expect(sixth.allowed).toBe(false)
    expect(sixth.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(sixth.retryAfterSec).toBeLessThanOrEqual(60)
  })

  it('never reports a Retry-After below one second at the window edge (AC-1.4)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) limiter.hit('1.2.3.4', T0)

    // 1ms before the window expires: the raw remainder rounds to 0, and a
    // Retry-After of 0 would invite an immediate retry.
    const edge = limiter.hit('1.2.3.4', T0 + WINDOW_MS - 1)
    expect(edge).toEqual({ allowed: false, retryAfterSec: 1 })
  })

  it('lets a blocked key through again once the window has passed (AC-1.5)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0 + 10).allowed).toBe(false)

    expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS)).toEqual({ allowed: true, retryAfterSec: 0 })
    // The window restarts rather than resuming, so four more hits are allowed.
    for (let i = 0; i < 4; i += 1) {
      expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS).allowed).toBe(true)
    }
    expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS).allowed).toBe(false)
  })

  it('restarts a stale bucket even when no sweep has run (AC-1.5)', () => {
    // The sweep is throttled to once per window, so an expired bucket can still
    // be sitting in the Map. Its count must not carry into the new window.
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    // Move the sweep clock on with a different key, so 1.2.3.4 is never swept.
    limiter.hit('5.6.7.8', T0 + WINDOW_MS)

    expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS + 1)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('keeps buckets independent per key (AC-1.6)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0).allowed).toBe(false)

    expect(limiter.hit('5.6.7.8', T0)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('drops expired buckets so the map cannot grow unbounded (AC-1.7)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 50; i += 1) limiter.hit(`10.0.0.${i}`, T0)
    expect(limiter.size).toBe(50)

    // A hit a full window later sweeps every stale key before recording its own.
    expect(limiter.hit('10.0.0.0', T0 + WINDOW_MS)).toEqual({ allowed: true, retryAfterSec: 0 })
    expect(limiter.size).toBe(1)
  })

  it('refuses new keys once the table is full rather than growing (AC-1.8)', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: WINDOW_MS, maxKeys: 3 })
    for (let i = 0; i < 3; i += 1) expect(limiter.hit(`10.0.0.${i}`, T0).allowed).toBe(true)
    expect(limiter.size).toBe(3)

    const overflow = limiter.hit('10.0.0.99', T0)
    expect(overflow).toEqual({ allowed: false, retryAfterSec: 60 })
    expect(limiter.size).toBe(3)

    // Known keys keep being counted while the table is full: the cap sheds new
    // keys, it does not stop enforcing the limit.
    expect(limiter.hit('10.0.0.0', T0).allowed).toBe(true)

    // Once the window rolls over the table drains and the new key gets in.
    expect(limiter.hit('10.0.0.99', T0 + WINDOW_MS).allowed).toBe(true)
    expect(limiter.size).toBe(1)
  })

  it('clears every bucket on reset()', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0).allowed).toBe(false)

    limiter.reset()
    expect(limiter.size).toBe(0)
    expect(limiter.hit('1.2.3.4', T0)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('defaults `now` to the current clock when omitted', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) expect(limiter.hit('9.9.9.9').allowed).toBe(true)
    expect(limiter.hit('9.9.9.9').allowed).toBe(false)
  })
})
